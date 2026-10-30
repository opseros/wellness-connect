// Platform administration. Every function takes the acting staff member and
// checks permissions itself, so routes and pages can't forget to.
//   ops          day-to-day: verification, moderation, read-only users/orgs/audit
//   super_admin  everything ops can do + staff roles, suspensions, domain changes
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { account, auditLog, comment, credential, membership, organization, post, professionalProfile, report, session, user } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { audit } from "@/modules/platform/outbox";
import { reviewCredential, reviewInput } from "@/modules/professionals/service";
import { isCompanyDomain } from "@/modules/organizations/service";

export type StaffActor = { id: string; platformRole: "user" | "ops" | "super_admin"; twoFactorEnabled: boolean };

export function assertStaff(actor: StaffActor) {
  if (actor.platformRole === "user") throw forbidden();
  if (!actor.twoFactorEnabled) throw forbidden("Turn on two-factor authentication to use admin tools");
}

export function assertSuperAdmin(actor: StaffActor) {
  assertStaff(actor);
  if (actor.platformRole !== "super_admin") throw forbidden("Only a super admin can do this");
}

const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

// ---------- Credential verification ----------

export type QueueStatus = "pending" | "info_requested" | "approved" | "rejected" | "all";

export async function listCredentialQueue(actor: StaffActor, status: QueueStatus = "pending") {
  assertStaff(actor);
  return getDb()
    .select({
      id: credential.id,
      name: credential.name,
      issuer: credential.issuer,
      status: credential.status,
      createdAt: credential.createdAt,
      professionalName: user.name,
      professionalEmail: user.email,
      city: professionalProfile.city,
      headline: professionalProfile.headline,
    })
    .from(credential)
    .innerJoin(professionalProfile, eq(professionalProfile.id, credential.profileId))
    .innerJoin(user, eq(user.id, professionalProfile.userId))
    .where(status === "all" ? undefined : eq(credential.status, status))
    .orderBy(asc(credential.createdAt))
    .limit(200);
}

export async function getCredentialForReview(actor: StaffActor, credentialId: string) {
  assertStaff(actor);
  const db = getDb();
  const cred = await db.query.credential.findFirst({ where: eq(credential.id, credentialId) });
  if (!cred) throw notFound("Credential not found");
  const profile = await db.query.professionalProfile.findFirst({ where: eq(professionalProfile.id, cred.profileId) });
  const owner = profile && (await db.query.user.findFirst({ where: eq(user.id, profile.userId) }));
  const others = await db.select().from(credential).where(eq(credential.profileId, cred.profileId)).orderBy(asc(credential.createdAt));
  const reviewer = cred.reviewedBy ? await db.query.user.findFirst({ where: eq(user.id, cred.reviewedBy) }) : undefined;
  return { credential: cred, profile, owner, others: others.filter((o) => o.id !== cred.id), reviewerName: reviewer?.name };
}

/** Records who opened a private credential document. Returns the blob path to stream. */
export async function openCredentialDocument(actor: StaffActor, credentialId: string) {
  assertStaff(actor);
  const cred = await getDb().query.credential.findFirst({ where: eq(credential.id, credentialId) });
  if (!cred?.blobPath) throw notFound("No document for this credential");
  await audit(getDb(), { actorId: actor.id, action: "credential.view_document", targetType: "credential", targetId: cred.id });
  return cred.blobPath;
}

export async function decideCredential(actor: StaffActor, credentialId: string, input: z.input<typeof reviewInput>) {
  assertStaff(actor);
  return reviewCredential(actor.id, credentialId, input);
}

// ---------- Users ----------

export async function searchUsers(actor: StaffActor, q = "", limit = 50) {
  assertStaff(actor);
  const term = q.trim();
  return getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      platformRole: user.platformRole,
      twoFactorEnabled: user.twoFactorEnabled,
      suspendedAt: user.suspendedAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(term ? or(ilike(user.email, like(term)), ilike(user.name, like(term))) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(Math.min(limit, 200));
}

export async function getUserDetail(actor: StaffActor, userId: string) {
  assertStaff(actor);
  const db = getDb();
  const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!u) throw notFound("User not found");
  const [memberships, accounts, sessions, pro] = await Promise.all([
    db
      .select({ orgId: organization.id, orgName: organization.name, role: membership.role, status: membership.status })
      .from(membership)
      .innerJoin(organization, eq(organization.id, membership.orgId))
      .where(eq(membership.userId, userId)),
    db.select({ providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, userId)),
    db.select({ n: count() }).from(session).where(and(eq(session.userId, userId), sql`${session.expiresAt} > now()`)),
    db.query.professionalProfile.findFirst({ where: eq(professionalProfile.userId, userId) }),
  ]);
  return { user: u, memberships, signInMethods: accounts.map((a) => a.providerId), activeSessions: sessions[0]?.n ?? 0, professional: pro ?? null };
}

export const roleInput = z.object({ role: z.enum(["user", "ops"]) });

/** Super admins grant or remove the ops role. Super admin itself is only set via SUPER_ADMIN_EMAILS or SQL. */
export async function setPlatformRole(actor: StaffActor, userId: string, input: z.input<typeof roleInput>) {
  assertSuperAdmin(actor);
  const { role } = roleInput.parse(input);
  if (userId === actor.id) throw badRequest("You can't change your own role");
  return getDb().transaction(async (tx) => {
    const target = await tx.query.user.findFirst({ where: eq(user.id, userId) });
    if (!target) throw notFound("User not found");
    if (target.platformRole === "super_admin") throw forbidden("Super admins can't be changed here");
    if (role === "ops" && !target.emailVerified) throw badRequest("Only verified users can become staff");
    await tx.update(user).set({ platformRole: role, updatedAt: new Date() }).where(eq(user.id, userId));
    await audit(tx, { actorId: actor.id, action: "user.set_role", targetType: "user", targetId: userId, metadata: { from: target.platformRole, to: role } });
  });
}

export const suspendInput = z.object({ reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500) });

/** Suspension deletes every session immediately; the sign-in hook refuses new ones. */
export async function suspendUser(actor: StaffActor, userId: string, input: z.input<typeof suspendInput>) {
  assertSuperAdmin(actor);
  const { reason } = suspendInput.parse(input);
  if (userId === actor.id) throw badRequest("You can't suspend yourself");
  return getDb().transaction(async (tx) => {
    const target = await tx.query.user.findFirst({ where: eq(user.id, userId) });
    if (!target) throw notFound("User not found");
    if (target.platformRole === "super_admin") throw forbidden("Super admins can't be suspended here");
    await tx.update(user).set({ suspendedAt: new Date(), suspendedReason: reason, updatedAt: new Date() }).where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, { actorId: actor.id, action: "user.suspend", targetType: "user", targetId: userId, metadata: { reason } });
  });
}

export async function unsuspendUser(actor: StaffActor, userId: string) {
  assertSuperAdmin(actor);
  await getDb().transaction(async (tx) => {
    const [row] = await tx.update(user).set({ suspendedAt: null, suspendedReason: null, updatedAt: new Date() }).where(eq(user.id, userId)).returning();
    if (!row) throw notFound("User not found");
    await audit(tx, { actorId: actor.id, action: "user.unsuspend", targetType: "user", targetId: userId });
  });
}

// ---------- Organizations ----------

export async function listOrganizations(actor: StaffActor, q = "") {
  assertStaff(actor);
  const term = q.trim();
  return getDb()
    .select({
      id: organization.id,
      name: organization.name,
      kind: organization.kind,
      domain: organization.domain,
      domainVerifiedAt: organization.domainVerifiedAt,
      createdAt: organization.createdAt,
      activeMembers: sql<number>`(select count(*)::int from ${membership} where ${membership.orgId} = ${organization.id} and ${membership.status} = 'active')`,
      pendingMembers: sql<number>`(select count(*)::int from ${membership} where ${membership.orgId} = ${organization.id} and ${membership.status} = 'pending')`,
    })
    .from(organization)
    .where(term ? or(ilike(organization.name, like(term)), ilike(organization.domain, like(term))) : undefined)
    .orderBy(desc(organization.createdAt))
    .limit(200);
}

export const domainInput = z.object({ domain: z.string().trim().toLowerCase() });

/** Link and verify a company email domain after checking ownership offline (e.g. a DNS record or an email from IT). */
export async function setOrganizationDomain(actor: StaffActor, orgId: string, input: z.input<typeof domainInput>) {
  assertSuperAdmin(actor);
  const domain = domainInput.parse(input).domain.replace(/^@/, "");
  if (domain && !isCompanyDomain(domain)) throw badRequest("Use a company domain, not a public mail domain");
  return getDb().transaction(async (tx) => {
    if (domain) {
      const taken = await tx.query.organization.findFirst({ where: eq(organization.domain, domain) });
      if (taken && taken.id !== orgId) throw badRequest(`${domain} already belongs to ${taken.name}`);
    }
    const [row] = await tx
      .update(organization)
      .set({ domain: domain || null, domainVerifiedAt: domain ? new Date() : null })
      .where(eq(organization.id, orgId))
      .returning();
    if (!row) throw notFound("Organization not found");
    await audit(tx, { actorId: actor.id, action: "organization.set_domain", targetType: "organization", targetId: orgId, metadata: { domain } });
    return row;
  });
}

// ---------- Reports (moderation) ----------

export async function listReports(actor: StaffActor, status: "open" | "actioned" | "dismissed" = "open") {
  assertStaff(actor);
  const db = getDb();
  const rows = await db
    .select({ r: report, reporterName: user.name, reporterEmail: user.email })
    .from(report)
    .innerJoin(user, eq(user.id, report.reporterId))
    .where(eq(report.status, status))
    .orderBy(asc(report.createdAt))
    .limit(200);
  const postIds = rows.filter((x) => x.r.targetType === "post").map((x) => x.r.targetId);
  const commentIds = rows.filter((x) => x.r.targetType === "comment").map((x) => x.r.targetId);
  const [posts, comments] = await Promise.all([
    postIds.length ? db.select({ id: post.id, body: post.body, deletedAt: post.deletedAt }).from(post).where(inArray(post.id, postIds)) : [],
    commentIds.length ? db.select({ id: comment.id, body: comment.body, deletedAt: comment.deletedAt }).from(comment).where(inArray(comment.id, commentIds)) : [],
  ]);
  const content = new Map([...posts, ...comments].map((c) => [c.id, c]));
  return rows.map((x) => ({ ...x.r, reporterName: x.reporterName, reporterEmail: x.reporterEmail, content: content.get(x.r.targetId) ?? null }));
}

export const resolveInput = z.object({ action: z.enum(["dismiss", "remove_content"]) });

export async function resolveReport(actor: StaffActor, reportId: string, input: z.input<typeof resolveInput>) {
  assertStaff(actor);
  const { action } = resolveInput.parse(input);
  return getDb().transaction(async (tx) => {
    const r = await tx.query.report.findFirst({ where: and(eq(report.id, reportId), eq(report.status, "open")) });
    if (!r) throw notFound("Open report not found");
    if (action === "remove_content") {
      if (r.targetType === "post") await tx.update(post).set({ deletedAt: new Date() }).where(and(eq(post.id, r.targetId), isNull(post.deletedAt)));
      else if (r.targetType === "comment") await tx.update(comment).set({ deletedAt: new Date() }).where(and(eq(comment.id, r.targetId), isNull(comment.deletedAt)));
      else throw badRequest("Only posts and comments can be removed here; suspend the member instead");
    }
    await tx.update(report).set({ status: action === "dismiss" ? "dismissed" : "actioned" }).where(eq(report.id, r.id));
    await audit(tx, { actorId: actor.id, action: `report.${action}`, targetType: r.targetType, targetId: r.targetId, metadata: { reportId: r.id } });
  });
}

// ---------- Audit log ----------

export async function listAuditLog(actor: StaffActor, filter: { action?: string; actor?: string; target?: string } = {}) {
  assertStaff(actor);
  const conds: SQL[] = [];
  if (filter.action) conds.push(ilike(auditLog.action, like(filter.action)));
  if (filter.actor) conds.push(or(ilike(user.email, like(filter.actor)), ilike(user.name, like(filter.actor)))!);
  if (filter.target) conds.push(eq(auditLog.targetId, filter.target));
  return getDb()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(200);
}

export async function adminCounts(actor: StaffActor) {
  assertStaff(actor);
  const db = getDb();
  const [[pending], [reports]] = await Promise.all([
    db.select({ n: count() }).from(credential).where(eq(credential.status, "pending")),
    db.select({ n: count() }).from(report).where(eq(report.status, "open")),
  ]);
  return { pendingCredentials: pending.n, openReports: reports.n };
}


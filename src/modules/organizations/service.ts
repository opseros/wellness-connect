import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { invitation, organization, membership, user, type OrgRole } from "@/db/schema";
import { getDb, type Executor, type Tx } from "@/db/client";
import { assertUuid, badRequest, forbidden, notFound } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { BRAND } from "@/lib/brand";
import { enqueue, audit } from "@/modules/platform/outbox";

/** Free/public mailbox domains never link someone to a company. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.in", "icloud.com", "me.com", "proton.me", "protonmail.com",
  "rediffmail.com", "aol.com", "zoho.com", "gmx.com", "mail.com",
]);

export function emailDomain(email: string): string {
  return email.split("@")[1]?.trim().toLowerCase() ?? "";
}

export function isCompanyDomain(domain: string): boolean {
  return domain.length > 3 && domain.includes(".") && !PUBLIC_EMAIL_DOMAINS.has(domain);
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "org";

export const createOrganizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["company", "provider", "homestay", "hospital"]).default("company"),
});

/**
 * Creates the organization with the caller as active owner. If the caller's
 * verified email is on a company domain, that domain is linked and verified so
 * colleagues can request to join.
 */
export async function createOrganization(
  actor: { id: string; email: string; emailVerified: boolean },
  input: z.input<typeof createOrganizationInput>,
  /** Runs in the same transaction, e.g. to create a homestay or hospital listing. */
  then?: (tx: Tx, org: typeof organization.$inferSelect) => Promise<void>,
) {
  const data = createOrganizationInput.parse(input);
  if (!actor.emailVerified) throw forbidden("Verify your email before creating an organization");
  const domain = emailDomain(actor.email);
  const linkDomain = data.kind === "company" && isCompanyDomain(domain);

  return getDb().transaction(async (tx) => {
    if (linkDomain) {
      const existing = await tx.query.organization.findFirst({ where: eq(organization.domain, domain) });
      if (existing) throw badRequest(`${domain} already belongs to ${existing.name}. Ask to join it instead.`);
    }
    const [org] = await tx
      .insert(organization)
      .values({
        name: data.name,
        kind: data.kind,
        slug: `${slugify(data.name)}-${crypto.randomUUID().slice(0, 6)}`,
        domain: linkDomain ? domain : null,
        domainVerifiedAt: linkDomain ? new Date() : null,
      })
      .returning();
    await tx.insert(membership).values({ orgId: org.id, userId: actor.id, role: "owner", status: "active" });
    await audit(tx, { actorId: actor.id, action: "organization.create", targetType: "organization", targetId: org.id, metadata: { kind: org.kind } });
    if (then) await then(tx, org);
    return org;
  });
}

/** Called once a user's email is verified: request to join the company that owns the domain. */
export async function requestJoinByDomain(userId: string, email: string) {
  const domain = emailDomain(email);
  if (!isCompanyDomain(domain)) return null;
  const db = getDb();
  const org = await db.query.organization.findFirst({
    where: and(eq(organization.domain, domain), isNotNull(organization.domainVerifiedAt)),
  });
  if (!org) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(membership)
      .values({ orgId: org.id, userId, role: "member", status: "pending" })
      .onConflictDoNothing()
      .returning();
    if (row) await enqueue(tx, { type: "membership.requested", payload: { orgId: org.id, userId, email } });
    return row ?? null;
  });
}

/** A user's memberships. Without an executor, deduplicated per request (header, page and nav all ask). */
export async function listMemberships(userId: string, db?: Executor) {
  return db ? queryMemberships(userId, db) : membershipsForRender(userId);
}
const membershipsForRender = cache((userId: string) => queryMemberships(userId, getDb()));

async function queryMemberships(userId: string, db: Executor) {
  return db
    .select({ membership, organization })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, userId));
}

/** Throws unless the user is an ACTIVE member of the org with one of the roles. */
export async function requireOrgRole(userId: string, orgId: string, roles: readonly OrgRole[], db: Executor = getDb()) {
  assertUuid(orgId, "Organization");
  const m = await db.query.membership.findFirst({
    where: and(eq(membership.orgId, orgId), eq(membership.userId, userId), eq(membership.status, "active")),
  });
  if (!m || !roles.includes(m.role)) throw forbidden();
  return m;
}

export const ORG_ADMINS: readonly OrgRole[] = ["owner", "admin"];
export const ORG_BUYERS: readonly OrgRole[] = ["owner", "admin", "wellness_manager"];

export async function listPendingMembers(actorId: string, orgId: string) {
  await requireOrgRole(actorId, orgId, ORG_ADMINS);
  return getDb()
    .select({ membershipId: membership.id, userId: user.id, name: user.name, email: user.email, createdAt: membership.createdAt })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.orgId, orgId), eq(membership.status, "pending")));
}

export const approveMemberInput = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(["admin", "wellness_manager", "member"]),
});

/** Owners/admins approve pending members. Only an owner may create another admin. */
export async function approveMember(actorId: string, orgId: string, input: z.input<typeof approveMemberInput>) {
  const data = approveMemberInput.parse(input);
  return getDb().transaction(async (tx) => {
    const actor = await requireOrgRole(actorId, orgId, ORG_ADMINS, tx);
    if (data.role === "admin" && actor.role !== "owner") throw forbidden("Only an owner can grant admin");
    const [row] = await tx
      .update(membership)
      .set({ status: "active", role: data.role })
      .where(and(eq(membership.id, data.membershipId), eq(membership.orgId, orgId), eq(membership.status, "pending")))
      .returning();
    if (!row) throw notFound("No pending request with that id");
    await audit(tx, { actorId, action: "membership.approve", targetType: "membership", targetId: row.id, metadata: { role: data.role } });
    return row;
  });
}

export async function orgAdminEmails(orgId: string, db: Executor = getDb()) {
  const rows = await db
    .select({ email: user.email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.orgId, orgId), eq(membership.status, "active"), inArray(membership.role, ["owner", "admin"])));
  return rows.map((r) => r.email);
}

// ---------- M3: company settings, members and invitations ----------

export const ORG_ALL: readonly OrgRole[] = ["owner", "admin", "wellness_manager", "member"];
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** The org plus the caller's active membership; 404 for non-members (no hint the org exists). */
export async function getOrgForMember(userId: string, orgId: string) {
  assertUuid(orgId, "Organization");
  const db = getDb();
  const m = await db.query.membership.findFirst({
    where: and(eq(membership.orgId, orgId), eq(membership.userId, userId), eq(membership.status, "active")),
  });
  if (!m) throw notFound("Organization not found");
  const org = await db.query.organization.findFirst({ where: eq(organization.id, orgId) });
  if (!org) throw notFound("Organization not found");
  return { org, role: m.role };
}

/** Active memberships of COMPANIES where the user can run the marketplace (owner, admin, wellness manager). */
export async function listBuyerOrgs(userId: string) {
  const rows = await listMemberships(userId);
  return rows.filter((r) => r.organization.kind === "company" && r.membership.status === "active" && ORG_BUYERS.includes(r.membership.role));
}

/** True if the user is an active member of the org (any role). */
export async function isActiveMember(userId: string | null, orgId: string, db: Executor = getDb()) {
  if (!userId) return false;
  const m = await db.query.membership.findFirst({
    where: and(eq(membership.orgId, orgId), eq(membership.userId, userId), eq(membership.status, "active")),
    columns: { id: true },
  });
  return Boolean(m);
}

/** Renames an organization; the caller has already checked the role in the same transaction. */
export async function renameOrganization(orgId: string, name: string, db: Executor = getDb()) {
  await db.update(organization).set({ name }).where(eq(organization.id, orgId));
}

/** Only companies post requirements and book; homestays and hospitals have their own workspaces. */
export async function assertCompanyOrg(orgId: string, db: Executor = getDb()) {
  const org = await db.query.organization.findFirst({ where: eq(organization.id, orgId), columns: { kind: true } });
  if (!org) throw notFound("Organization not found");
  if (org.kind !== "company") throw forbidden("Only companies can post requirements");
}

export const orgSettingsInput = z.object({
  name: z.string().trim().min(2, "Company name must be at least 2 characters").max(120),
  city: z.string().trim().max(80).default(""),
  address: z.string().trim().max(400).default(""),
  billingEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid billing email")]).default(""),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5")
    .default(""),
});

export async function updateOrgSettings(actorId: string, orgId: string, input: z.input<typeof orgSettingsInput>) {
  const d = orgSettingsInput.parse(input);
  return getDb().transaction(async (tx) => {
    await requireOrgRole(actorId, orgId, ORG_ADMINS, tx);
    const [row] = await tx.update(organization).set(d).where(eq(organization.id, orgId)).returning();
    await audit(tx, { actorId, action: "organization.update", targetType: "organization", targetId: orgId });
    return row;
  });
}

export async function listMembers(actorId: string, orgId: string) {
  await requireOrgRole(actorId, orgId, ORG_ALL);
  return getDb()
    .select({ membershipId: membership.id, userId: user.id, name: user.name, email: user.email, role: membership.role, status: membership.status, createdAt: membership.createdAt })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.orgId, orgId), isNull(user.deletedAt)))
    .orderBy(asc(membership.status), asc(user.name));
}

export const memberRoleInput = z.object({ role: z.enum(["admin", "wellness_manager", "member"]) });

/**
 * Owners and admins manage roles. Only an owner grants or removes admin.
 * Nobody changes their own role, and owners can't be changed here.
 */
export async function changeMemberRole(actorId: string, orgId: string, membershipId: string, input: z.input<typeof memberRoleInput>) {
  const { role } = memberRoleInput.parse(input);
  assertUuid(membershipId, "Member");
  return getDb().transaction(async (tx) => {
    const actor = await requireOrgRole(actorId, orgId, ORG_ADMINS, tx);
    const target = await tx.query.membership.findFirst({ where: and(eq(membership.id, membershipId), eq(membership.orgId, orgId)) });
    if (!target) throw notFound("Member not found");
    if (target.userId === actorId) throw badRequest("You can't change your own role");
    if (target.role === "owner") throw forbidden("Owners can't be changed");
    if ((role === "admin" || target.role === "admin") && actor.role !== "owner") throw forbidden("Only an owner can grant or remove admin");
    const [row] = await tx.update(membership).set({ role, status: "active" }).where(eq(membership.id, membershipId)).returning();
    await audit(tx, { actorId, action: target.status === "pending" ? "membership.approve" : "membership.role", targetType: "membership", targetId: row.id, metadata: { from: target.role, to: role } });
    return row;
  });
}

/** Removes a member, or declines a pending join request. Same role rules as changing roles. */
export async function removeMember(actorId: string, orgId: string, membershipId: string) {
  assertUuid(membershipId, "Member");
  return getDb().transaction(async (tx) => {
    const actor = await requireOrgRole(actorId, orgId, ORG_ADMINS, tx);
    const target = await tx.query.membership.findFirst({ where: and(eq(membership.id, membershipId), eq(membership.orgId, orgId)) });
    if (!target) throw notFound("Member not found");
    if (target.userId === actorId) throw badRequest("You can't remove yourself");
    if (target.role === "owner") throw forbidden("Owners can't be removed");
    if (target.role === "admin" && actor.role !== "owner") throw forbidden("Only an owner can remove an admin");
    await tx.delete(membership).where(eq(membership.id, membershipId));
    await audit(tx, { actorId, action: target.status === "pending" ? "membership.decline" : "membership.remove", targetType: "membership", targetId: membershipId, metadata: { userId: target.userId } });
  });
}

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["admin", "wellness_manager", "member"]).default("member"),
});

const INVITE_DAYS = 14;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Invite a colleague by email. Any address is allowed (agencies, consultants),
 * not just the company domain. The email is sent directly (like sign-in
 * emails) because the outbox must never store the raw token.
 */
export async function inviteMember(actorId: string, orgId: string, input: z.input<typeof inviteInput>) {
  const d = inviteInput.parse(input);
  const token = randomBytes(32).toString("base64url");
  const { org, inviter } = await getDb().transaction(async (tx) => {
    const actor = await requireOrgRole(actorId, orgId, ORG_ADMINS, tx);
    if (d.role === "admin" && actor.role !== "owner") throw forbidden("Only an owner can invite admins");
    const existing = await tx
      .select({ id: membership.id })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.orgId, orgId), eq(user.email, d.email), eq(membership.status, "active")));
    if (existing.length) throw badRequest("That person is already a member");
    // Re-inviting replaces any open invitation for the same address.
    await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitation.orgId, orgId), eq(invitation.email, d.email), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)));
    const [row] = await tx
      .insert(invitation)
      .values({ orgId, email: d.email, role: d.role, tokenHash: hashToken(token), invitedBy: actorId, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) })
      .returning();
    await audit(tx, { actorId, action: "invitation.create", targetType: "invitation", targetId: row.id, metadata: { email: d.email, role: d.role } });
    const o = await tx.query.organization.findFirst({ where: eq(organization.id, orgId) });
    const u = await tx.query.user.findFirst({ where: eq(user.id, actorId) });
    return { org: o!, inviter: u! };
  });
  await sendEmail({
    to: d.email,
    subject: `${inviter.name} invited you to ${org.name} on ${BRAND.name}`,
    text: `${inviter.name} invited you to join ${org.name} on ${BRAND.name}${org.kind === "homestay" ? " to help run its homestay listing" : org.kind === "hospital" ? " to help run its hospital profile" : ", where your team books verified wellness professionals"}.\n\nAccept the invitation (sign in or create an account with this email address):\n${appUrl()}/invite/${token}\n\nThe link expires in ${INVITE_DAYS} days. If you weren't expecting this, ignore this email.`,
  });
  return { email: d.email, role: d.role };
}

export async function listInvitations(actorId: string, orgId: string) {
  await requireOrgRole(actorId, orgId, ORG_ADMINS);
  return getDb()
    .select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt })
    .from(invitation)
    .where(and(eq(invitation.orgId, orgId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date())))
    .orderBy(desc(invitation.createdAt));
}

export async function revokeInvitation(actorId: string, orgId: string, invitationId: string) {
  assertUuid(invitationId, "Invitation");
  return getDb().transaction(async (tx) => {
    await requireOrgRole(actorId, orgId, ORG_ADMINS, tx);
    const [row] = await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitation.id, invitationId), eq(invitation.orgId, orgId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)))
      .returning();
    if (!row) throw notFound("Invitation not found");
    await audit(tx, { actorId, action: "invitation.revoke", targetType: "invitation", targetId: row.id });
  });
}

async function findOpenInvitation(token: string, db: Executor) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const inv = await db.query.invitation.findFirst({ where: eq(invitation.tokenHash, hashToken(token)) });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date()) return null;
  return inv;
}

/** For the invitation page: who invited you where, without revealing anything to a wrong account. */
export async function previewInvitation(token: string) {
  const db = getDb();
  const inv = await findOpenInvitation(token, db);
  if (!inv) return null;
  const org = await db.query.organization.findFirst({ where: eq(organization.id, inv.orgId) });
  return { email: inv.email, role: inv.role, orgName: org?.name ?? "", orgId: inv.orgId };
}

/** The signed-in user's VERIFIED email must equal the invited address. */
export async function acceptInvitation(actor: { id: string; email: string; emailVerified: boolean }, token: string) {
  if (!actor.emailVerified) throw forbidden("Verify your email first");
  return getDb().transaction(async (tx) => {
    const inv = await findOpenInvitation(token, tx);
    if (!inv) throw notFound("This invitation has expired or was already used");
    if (inv.email !== actor.email.toLowerCase()) throw forbidden(`This invitation is for ${inv.email}. Sign in with that email to accept it.`);
    const existing = await tx.query.membership.findFirst({ where: and(eq(membership.orgId, inv.orgId), eq(membership.userId, actor.id)) });
    if (existing?.status === "active") {
      await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
      return { orgId: inv.orgId, role: existing.role };
    }
    if (existing) await tx.update(membership).set({ status: "active", role: inv.role }).where(eq(membership.id, existing.id));
    else await tx.insert(membership).values({ orgId: inv.orgId, userId: actor.id, role: inv.role, status: "active" });
    await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
    await audit(tx, { actorId: actor.id, action: "invitation.accept", targetType: "invitation", targetId: inv.id, metadata: { orgId: inv.orgId, role: inv.role } });
    return { orgId: inv.orgId, role: inv.role };
  });
}

/** Count of members per status, for the dashboard header. */
export async function memberCounts(orgId: string) {
  const rows = await getDb()
    .select({ status: membership.status, n: sql<number>`count(*)::int` })
    .from(membership)
    .where(and(eq(membership.orgId, orgId), ne(membership.role, "owner")))
    .groupBy(membership.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<"active" | "pending", number>>;
}

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { organization, membership, user, type OrgRole } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
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
  kind: z.enum(["company", "provider"]).default("company"),
});

/**
 * Creates the organization with the caller as active owner. If the caller's
 * verified email is on a company domain, that domain is linked and verified so
 * colleagues can request to join.
 */
export async function createOrganization(
  actor: { id: string; email: string; emailVerified: boolean },
  input: z.input<typeof createOrganizationInput>,
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
    await audit(tx, { actorId: actor.id, action: "organization.create", targetType: "organization", targetId: org.id });
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

export async function listMemberships(userId: string, db: Executor = getDb()) {
  return db
    .select({ membership, organization })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, userId));
}

/** Throws unless the user is an ACTIVE member of the org with one of the roles. */
export async function requireOrgRole(userId: string, orgId: string, roles: readonly OrgRole[], db: Executor = getDb()) {
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

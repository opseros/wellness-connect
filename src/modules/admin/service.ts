// Platform administration. Every function takes the acting staff member and
// checks permissions itself, so routes and pages can't forget to.
//   ops          day-to-day: verification, moderation, read-only users/orgs/audit
//   super_admin  everything ops can do + staff roles, suspensions, domain changes
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  financeAttentionCount,
  financeOverview,
  financeSettingsInput,
  getInvoiceAsStaff,
  listFinanceQueues,
  markInvoicePaidAsStaff,
  markRefundProcessedAsStaff,
  payoutInput,
  readFinanceSettings,
  recordPayoutAsStaff,
  updateFinanceSettings,
} from "@/modules/marketplace/payments";
import { listCategories, setCategoryCommission } from "@/modules/professionals/service";
import { z } from "zod";
import { featureFlag, booking, careQuote, invitation, stay, account, auditLog, comment, connection, conversationParticipant, credential, group, listing, listingPhoto, memberProfile, orgDocument, membership, organization, post, professionalProfile, report, session, twoFactor, user } from "@/db/schema";
import { getDb, withScope, type Tx } from "@/db/client";
import { assertUuid, badRequest, forbidden, notFound } from "@/lib/errors";
import { audit } from "@/modules/platform/outbox";
import { FEATURES, featureOn, listFeatures, type FeatureKey } from "@/modules/platform/features";
import { reviewCredential, reviewInput } from "@/modules/professionals/service";
import { isCompanyDomain } from "@/modules/organizations/service";
import { getStayInvoice, listStayFinanceQueues, recordStayPayoutAsStaff, stayFinanceOverview, stayPayoutInput } from "@/modules/marketplace/stay-payments";
import { listingReviewInput, openListingPhoto, reviewListing, staffChecklist } from "@/modules/listings/service";

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

// ---------- Homestay and hospital verification (M6) ----------

export type ListingQueueStatus = "pending" | "changes_requested" | "verified" | "rejected" | "draft" | "all";

export async function listListingQueue(actor: StaffActor, status: ListingQueueStatus = "pending", kind?: "homestay" | "hospital" | "facility") {
  assertStaff(actor);
  return getDb()
    .select({ orgId: listing.orgId, kind: listing.kind, status: listing.status, city: listing.city, submittedAt: listing.submittedAt, reviewedAt: listing.reviewedAt, name: organization.name, suspendedAt: organization.suspendedAt, removedAt: organization.removedAt })
    .from(listing)
    .innerJoin(organization, eq(organization.id, listing.orgId))
    .where(and(status === "all" ? undefined : eq(listing.status, status), kind ? eq(listing.kind, kind) : undefined))
    .orderBy(status === "pending" ? asc(listing.submittedAt) : desc(listing.updatedAt))
    .limit(200);
}

/** Everything staff need to verify a listing. Document rows are read with audited staff bypass. */
export async function getListingForReview(actor: StaffActor, orgId: string) {
  assertStaff(actor);
  return withScope({ bypass: true, userId: actor.id }, async (tx) => {
    const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId) });
    const org = l && (await tx.query.organization.findFirst({ where: eq(organization.id, orgId) }));
    if (!l || !org) throw notFound("Listing not found");
    const docs = await tx
      .select({ id: orgDocument.id, docType: orgDocument.docType, name: orgDocument.name, status: orgDocument.status, createdAt: orgDocument.createdAt, blobPath: orgDocument.blobPath, uploadedBy: user.name })
      .from(orgDocument)
      .innerJoin(user, eq(user.id, orgDocument.uploadedBy))
      .where(eq(orgDocument.orgId, orgId))
      .orderBy(desc(orgDocument.createdAt));
    const photos = await tx.select({ id: listingPhoto.id, caption: listingPhoto.caption }).from(listingPhoto).where(eq(listingPhoto.orgId, orgId)).orderBy(asc(listingPhoto.position));
    const team = await tx
      .select({ name: user.name, email: user.email, role: membership.role })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.orgId, orgId), eq(membership.status, "active")));
    const reviewer = l.reviewedBy ? await tx.query.user.findFirst({ where: eq(user.id, l.reviewedBy) }) : undefined;
    return {
      listing: l,
      org,
      docs: docs.map(({ blobPath, ...d }) => ({ ...d, isPdf: blobPath.endsWith(".pdf") })),
      photos,
      team,
      checks: staffChecklist(l.kind, docs),
      reviewerName: reviewer?.name,
    };
  });
}

/** Records who opened a homestay/hospital document. Returns the blob path to stream. */
export async function openOrgDocument(actor: StaffActor, documentId: string) {
  assertStaff(actor);
  return withScope({ bypass: true, userId: actor.id }, async (tx) => {
    const doc = await tx.query.orgDocument.findFirst({ where: eq(orgDocument.id, documentId) });
    if (!doc) throw notFound("Document not found");
    await audit(tx, { actorId: actor.id, action: "org_document.view", targetType: "organization", targetId: doc.orgId, metadata: { documentId, docType: doc.docType } });
    return doc.blobPath;
  });
}

export async function openListingPhotoAsStaff(actor: StaffActor, photoId: string) {
  assertStaff(actor);
  return openListingPhoto(actor.id, photoId, true);
}

export async function decideListing(actor: StaffActor, orgId: string, input: z.input<typeof listingReviewInput>) {
  assertStaff(actor);
  return reviewListing(actor.id, orgId, input);
}

// ---------- Users ----------

export type UserFilter = "active" | "suspended" | "removed" | "all";

export async function searchUsers(actor: StaffActor, q = "", limit = 50, filter: UserFilter = "active") {
  assertStaff(actor);
  const term = q.trim();
  const conds: SQL[] = [];
  if (term) conds.push(or(ilike(user.email, like(term)), ilike(user.name, like(term)))!);
  if (filter === "active") conds.push(isNull(user.deletedAt), isNull(user.suspendedAt));
  if (filter === "suspended") conds.push(isNull(user.deletedAt), sql`${user.suspendedAt} is not null`);
  if (filter === "removed") conds.push(sql`${user.deletedAt} is not null`);
  return getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      platformRole: user.platformRole,
      twoFactorEnabled: user.twoFactorEnabled,
      suspendedAt: user.suspendedAt,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(conds.length ? and(...conds) : undefined)
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

export const editUserInput = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});

/**
 * Super admins correct a user's name or email. Changing the email marks it
 * unverified and signs the user out everywhere; they verify the new address
 * at their next sign-in.
 */
export async function editUser(actor: StaffActor, userId: string, input: z.input<typeof editUserInput>) {
  assertSuperAdmin(actor);
  const d = editUserInput.parse(input);
  return getDb().transaction(async (tx) => {
    const target = await tx.query.user.findFirst({ where: eq(user.id, userId) });
    if (!target || target.deletedAt) throw notFound("User not found");
    if (target.platformRole === "super_admin" && target.id !== actor.id) throw forbidden("Super admins can't be edited here");
    const emailChanged = d.email !== target.email.toLowerCase();
    if (emailChanged) {
      const taken = await tx.query.user.findFirst({ where: eq(user.email, d.email) });
      if (taken) throw badRequest("Another account already uses that email");
    }
    await tx
      .update(user)
      .set({ name: d.name, email: d.email, ...(emailChanged ? { emailVerified: false } : {}), updatedAt: new Date() })
      .where(eq(user.id, userId));
    if (emailChanged) await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, {
      actorId: actor.id,
      action: "user.edit",
      targetType: "user",
      targetId: userId,
      metadata: { ...(d.name !== target.name ? { name: [target.name, d.name] } : {}), ...(emailChanged ? { email: [target.email, d.email] } : {}) },
    });
    return { emailChanged };
  });
}

/**
 * Removes an account: personal details are erased and sign-in is impossible,
 * but the row stays (anonymised) so bookings, payments, reviews and the audit
 * trail remain intact. Their posts and comments are hidden; connections and
 * company memberships are deleted. This can't be undone.
 */
export async function removeUser(actor: StaffActor, userId: string, confirmEmail: string) {
  assertSuperAdmin(actor);
  if (userId === actor.id) throw badRequest("You can't remove your own account here");
  return getDb().transaction(async (tx) => {
    const target = await tx.query.user.findFirst({ where: eq(user.id, userId) });
    if (!target || target.deletedAt) throw notFound("User not found");
    if (target.platformRole === "super_admin") throw forbidden("Super admins can't be removed here");
    if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) throw badRequest("Type the user's email exactly to confirm");
    const now = new Date();
    await tx
      .update(user)
      .set({
        name: "Removed user",
        email: `removed-${target.id}@removed.invalid`,
        image: null,
        emailVerified: false,
        twoFactorEnabled: false,
        platformRole: "user",
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    await tx.delete(connection).where(or(eq(connection.userLow, userId), eq(connection.userHigh, userId)));
    await tx.delete(membership).where(eq(membership.userId, userId));
    await tx
      .update(memberProfile)
      .set({ headline: "", city: "", jobTitle: "", company: "", topics: [], visibility: "connections", updatedAt: now })
      .where(eq(memberProfile.userId, userId));
    await tx.update(professionalProfile).set({ discoverable: false, headline: "", bio: "", updatedAt: now }).where(eq(professionalProfile.userId, userId));
    await tx.update(post).set({ deletedAt: now }).where(and(eq(post.authorId, userId), isNull(post.deletedAt)));
    await tx.update(comment).set({ deletedAt: now }).where(and(eq(comment.authorId, userId), isNull(comment.deletedAt)));
    await audit(tx, { actorId: actor.id, action: "user.remove", targetType: "user", targetId: userId });
  });
}

// ---------- Organizations ----------

export type OrgFilter = "active" | "suspended" | "removed" | "all";

/** Every organisation with its kind, listing status (homestays and hospitals) and standing. */
export async function listOrganizations(actor: StaffActor, q = "", filter: OrgFilter = "active") {
  assertStaff(actor);
  const term = q.trim();
  const standing =
    filter === "active"
      ? and(isNull(organization.suspendedAt), isNull(organization.removedAt))
      : filter === "suspended"
        ? and(isNotNull(organization.suspendedAt), isNull(organization.removedAt))
        : filter === "removed"
          ? isNotNull(organization.removedAt)
          : undefined;
  return getDb()
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      kind: organization.kind,
      city: sql<string>`coalesce(nullif(${listing.city}, ''), ${organization.city})`,
      domain: organization.domain,
      domainVerifiedAt: organization.domainVerifiedAt,
      suspendedAt: organization.suspendedAt,
      removedAt: organization.removedAt,
      listingStatus: listing.status,
      createdAt: organization.createdAt,
      activeMembers: sql<number>`(select count(*)::int from ${membership} where ${membership.orgId} = ${organization.id} and ${membership.status} = 'active')`,
      pendingMembers: sql<number>`(select count(*)::int from ${membership} where ${membership.orgId} = ${organization.id} and ${membership.status} = 'pending')`,
    })
    .from(organization)
    .leftJoin(listing, eq(listing.orgId, organization.id))
    .where(and(standing, term ? or(ilike(organization.name, like(term)), ilike(organization.domain, like(term)), ilike(listing.city, like(term))) : undefined))
    .orderBy(desc(organization.createdAt))
    .limit(300);
}

/** Work that must finish before an organisation can be removed (bookings, stays, open quotes). */
async function openWork(tx: Tx, org: { id: string; kind: string }) {
  if (org.kind === "company") {
    const [b] = await tx.select({ n: count() }).from(booking).where(and(eq(booking.orgId, org.id), inArray(booking.status, ["pending", "confirmed", "in_progress"])));
    return b.n ? `${b.n} open booking${b.n === 1 ? "" : "s"}` : null;
  }
  if (org.kind === "homestay") {
    const [st] = await tx.select({ n: count() }).from(stay).where(and(eq(stay.orgId, org.id), inArray(stay.status, ["requested", "accepted", "confirmed"])));
    return st.n ? `${st.n} open stay${st.n === 1 ? "" : "s"}` : null;
  }
  if (org.kind === "facility") return null;
  const [cq] = await tx.select({ n: count() }).from(careQuote).where(and(eq(careQuote.orgId, org.id), inArray(careQuote.status, ["requested", "reports_requested", "quoted"])));
  return cq.n ? `${cq.n} open quote request${cq.n === 1 ? "" : "s"}` : null;
}

/** One organisation for the admin "manage" page. Read with audited-staff bypass (counts touch RLS tables). */
export async function getOrganizationDetail(actor: StaffActor, orgId: string) {
  assertStaff(actor);
  assertUuid(orgId, "Organization");
  return withScope({ bypass: true, userId: actor.id }, async (tx) => {
    const org = await tx.query.organization.findFirst({ where: eq(organization.id, orgId) });
    if (!org) throw notFound("Organization not found");
    const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId) });
    const team = await tx
      .select({ userId: user.id, name: user.name, email: user.email, role: membership.role, status: membership.status })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.orgId, orgId))
      .orderBy(asc(membership.createdAt));
    return { org, listing: l ?? null, team, openWork: org.removedAt ? null : await openWork(tx, org) };
  });
}

const optionalText = (max: number) => z.string().trim().max(max).optional();
export const editOrganizationInput = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  // Companies
  city: optionalText(80),
  address: optionalText(300),
  billingEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid billing email")]).optional(),
  gstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "GSTIN has 15 letters and digits")]).optional(),
  // Homestays and hospitals
  tagline: optionalText(160),
  area: optionalText(80),
  state: optionalText(80),
  contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid contact email")]).optional(),
  contactPhone: optionalText(30),
  website: z.union([z.literal(""), z.string().trim().url("Website must start with https://")]).optional(),
});

/** Staff correction of an organisation's details. The listing keeps its verification status. */
export async function editOrganization(actor: StaffActor, orgId: string, input: z.input<typeof editOrganizationInput>) {
  assertSuperAdmin(actor);
  assertUuid(orgId, "Organization");
  const d = editOrganizationInput.parse(input);
  return getDb().transaction(async (tx) => {
    const org = await tx.query.organization.findFirst({ where: eq(organization.id, orgId) });
    if (!org || org.removedAt) throw notFound("Organization not found");
    const changed: string[] = [];
    const orgPatch: Partial<typeof organization.$inferInsert> = {};
    if (d.name !== org.name) { orgPatch.name = d.name; changed.push("name"); }
    if (org.kind === "company") {
      for (const k of ["city", "address", "billingEmail", "gstin"] as const) {
        if (d[k] !== undefined && d[k] !== org[k]) { orgPatch[k] = d[k]; changed.push(k); }
      }
    }
    if (Object.keys(orgPatch).length) await tx.update(organization).set(orgPatch).where(eq(organization.id, orgId));
    if (org.kind !== "company") {
      const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId) });
      if (l) {
        const patch: Partial<typeof listing.$inferInsert> = {};
        for (const k of ["tagline", "city", "area", "state", "contactEmail", "contactPhone", "website"] as const) {
          if (d[k] !== undefined && d[k] !== l[k]) { patch[k] = d[k]; changed.push(k); }
        }
        if (Object.keys(patch).length) await tx.update(listing).set({ ...patch, updatedAt: new Date() }).where(eq(listing.orgId, orgId));
      }
    }
    if (changed.length) await audit(tx, { actorId: actor.id, action: "organization.edit", targetType: "organization", targetId: orgId, metadata: { fields: changed } });
    return { changed };
  });
}

/**
 * Suspends an organisation: hidden from directories, can't take new stays or quote
 * requests, and its members can't use its workspace. Existing records are untouched.
 */
export async function suspendOrganization(actor: StaffActor, orgId: string, input: z.input<typeof suspendInput>) {
  assertSuperAdmin(actor);
  assertUuid(orgId, "Organization");
  const { reason } = suspendInput.parse(input);
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(organization)
      .set({ suspendedAt: new Date(), suspendedReason: reason })
      .where(and(eq(organization.id, orgId), isNull(organization.suspendedAt), isNull(organization.removedAt)))
      .returning({ id: organization.id });
    if (!row) throw badRequest("Already suspended, removed or not found");
    await audit(tx, { actorId: actor.id, action: "organization.suspend", targetType: "organization", targetId: orgId, metadata: { reason } });
  });
}

export async function unsuspendOrganization(actor: StaffActor, orgId: string) {
  assertSuperAdmin(actor);
  assertUuid(orgId, "Organization");
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(organization)
      .set({ suspendedAt: null, suspendedReason: null })
      .where(and(eq(organization.id, orgId), isNotNull(organization.suspendedAt), isNull(organization.removedAt)))
      .returning({ id: organization.id });
    if (!row) throw badRequest("Not suspended");
    await audit(tx, { actorId: actor.id, action: "organization.unsuspend", targetType: "organization", targetId: orgId });
  });
}

/**
 * Closes an organisation for good. Refused while it has open bookings, stays or quote
 * requests. Memberships and invitations are deleted and the email domain is released;
 * bookings, stays, invoices, payouts and the audit trail keep their references.
 */
export async function removeOrganization(actor: StaffActor, orgId: string, confirmName: string) {
  assertSuperAdmin(actor);
  assertUuid(orgId, "Organization");
  return withScope({ bypass: true, userId: actor.id }, async (tx) => {
    const org = await tx.query.organization.findFirst({ where: eq(organization.id, orgId) });
    if (!org || org.removedAt) throw notFound("Organization not found");
    if (confirmName.trim() !== org.name) throw badRequest("Type the organisation's name exactly to confirm");
    const open = await openWork(tx, org);
    if (open) throw badRequest(`It still has ${open}. Finish or cancel them first.`);
    const now = new Date();
    await tx.update(organization).set({ removedAt: now, suspendedAt: org.suspendedAt ?? now, domain: null, domainVerifiedAt: null }).where(eq(organization.id, orgId));
    await tx.delete(membership).where(eq(membership.orgId, orgId));
    await tx.delete(invitation).where(eq(invitation.orgId, orgId));
    await audit(tx, { actorId: actor.id, action: "organization.remove", targetType: "organization", targetId: orgId, metadata: { name: org.name, kind: org.kind } });
  });
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
  const ids = (t: string) => rows.filter((x) => x.r.targetType === t).map((x) => x.r.targetId);
  const userIds = ids("user");
  const groupIds = ids("group");
  const convIds = ids("message");
  const [posts, comments, users, groups, parts] = await Promise.all([
    postIds.length ? db.select({ id: post.id, body: post.body, deletedAt: post.deletedAt }).from(post).where(inArray(post.id, postIds)) : [],
    commentIds.length ? db.select({ id: comment.id, body: comment.body, deletedAt: comment.deletedAt }).from(comment).where(inArray(comment.id, commentIds)) : [],
    userIds.length ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds)) : [],
    groupIds.length ? db.select({ id: group.id, name: group.name, slug: group.slug, archivedAt: group.archivedAt }).from(group).where(inArray(group.id, groupIds)) : [],
    convIds.length
      ? db.select({ id: conversationParticipant.conversationId, name: user.name }).from(conversationParticipant).innerJoin(user, eq(user.id, conversationParticipant.userId)).where(inArray(conversationParticipant.conversationId, convIds))
      : [],
  ]);
  const content = new Map([...posts, ...comments].map((c) => [c.id, c]));
  // Staff see who a reported conversation is between, never the messages themselves.
  const label = new Map<string, { text: string; href?: string; archived?: boolean }>();
  for (const u of users) label.set(u.id, { text: `Member: ${u.name}`, href: `/admin/users/${u.id}` });
  for (const g of groups) label.set(g.id, { text: `Group: ${g.name}`, href: `/connect/groups/${g.slug}`, archived: Boolean(g.archivedAt) });
  for (const id of convIds) label.set(id, { text: `Conversation between ${parts.filter((p) => p.id === id).map((p) => p.name).join(" and ")}` });
  return rows.map((x) => ({ ...x.r, reporterName: x.reporterName, reporterEmail: x.reporterEmail, content: content.get(x.r.targetId) ?? null, target: label.get(x.r.targetId) ?? null }));
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
      else if (r.targetType === "group") {
        const g = await tx.query.group.findFirst({ where: eq(group.id, r.targetId) });
        if (g?.kind === "space") throw badRequest("Spaces can't be archived; remove the posts instead");
        await tx.update(group).set({ archivedAt: new Date() }).where(and(eq(group.id, r.targetId), isNull(group.archivedAt)));
      }
      else throw badRequest("Only posts, comments and communities can be removed here; suspend the member instead");
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
  const byKind = await db.select({ kind: listing.kind, n: count() }).from(listing).where(eq(listing.status, "pending")).groupBy(listing.kind);
  const pendingHomestays = byKind.find((r) => r.kind === "homestay")?.n ?? 0;
  const pendingHospitals = byKind.find((r) => r.kind === "hospital")?.n ?? 0;
  const pendingFacilities = byKind.find((r) => r.kind === "facility")?.n ?? 0;
  const hospitals = actor.platformRole === "super_admin" || (await featureOn("hospitals"));
  return { pendingCredentials: pending.n, pendingListings: pendingHomestays + pendingHospitals + pendingFacilities, pendingHomestays, pendingHospitals, pendingFacilities, hospitals, openReports: reports.n, financeAttention: await financeAttentionCount() };
}


// ---------- Finance (M4) ----------
// Everyone on staff can see finance; only super admins move money or change settings.

export async function adminFinance(actor: StaffActor) {
  assertStaff(actor);
  const [overview, queues, settings, categories] = await Promise.all([financeOverview(), listFinanceQueues(), readFinanceSettings(), listCategories()]);
  return { overview, queues, settings, categories };
}

export async function adminInvoice(actor: StaffActor, invoiceId: string) {
  assertStaff(actor);
  return getInvoiceAsStaff(invoiceId);
}

export async function adminMarkInvoicePaid(actor: StaffActor, invoiceId: string, reference: string) {
  assertSuperAdmin(actor);
  return markInvoicePaidAsStaff(actor.id, invoiceId, reference);
}

export async function adminMarkRefundProcessed(actor: StaffActor, refundId: string, reference: string) {
  assertSuperAdmin(actor);
  return markRefundProcessedAsStaff(actor.id, refundId, reference);
}

export async function adminRecordPayout(actor: StaffActor, bookingId: string, input: z.input<typeof payoutInput>) {
  assertSuperAdmin(actor);
  return recordPayoutAsStaff(actor.id, bookingId, input);
}

export async function adminRecordStayPayout(actor: StaffActor, stayId: string, input: z.input<typeof stayPayoutInput>) {
  assertSuperAdmin(actor);
  return recordStayPayoutAsStaff(actor.id, stayId, input);
}

/** Homestay stay money for the finance page (M7). */
export async function adminStayFinance(actor: StaffActor) {
  assertStaff(actor);
  const [overview, queues] = [await stayFinanceOverview(), await listStayFinanceQueues()];
  return { overview, queues };
}

export async function adminStayInvoice(actor: StaffActor, invoiceId: string) {
  assertStaff(actor);
  return getStayInvoice({ userId: actor.id, bypass: true }, invoiceId);
}

export async function adminUpdateFinanceSettings(actor: StaffActor, input: z.input<typeof financeSettingsInput>) {
  assertSuperAdmin(actor);
  return updateFinanceSettings(actor.id, input);
}

export const categoryCommissionInput = z.object({ categoryId: z.string().uuid(), percent: z.number().min(0).max(50).nullable() });

export async function adminSetCategoryCommission(actor: StaffActor, input: z.input<typeof categoryCommissionInput>) {
  assertSuperAdmin(actor);
  const d = categoryCommissionInput.parse(input);
  const row = await setCategoryCommission(d.categoryId, d.percent == null ? null : Math.round(d.percent * 100));
  await audit(getDb(), { actorId: actor.id, action: "category.commission", targetType: "category", targetId: row.id, metadata: { commissionBps: row.commissionBps } });
  return row;
}

// ---------- Platform switches (Admin → Settings) ----------

export async function listPlatformFeatures(actor: StaffActor) {
  assertStaff(actor);
  return listFeatures();
}

export const featureInput = z.object({ key: z.enum(Object.keys(FEATURES) as [FeatureKey, ...FeatureKey[]]), enabled: z.boolean() });

/** Turns a platform feature on or off for everyone (super admins always see it). Audited. */
export async function setPlatformFeature(actor: StaffActor, input: z.input<typeof featureInput>) {
  assertSuperAdmin(actor);
  const d = featureInput.parse(input);
  return getDb().transaction(async (tx) => {
    await tx
      .insert(featureFlag)
      .values({ key: d.key, enabled: d.enabled, updatedBy: actor.id, updatedAt: new Date() })
      .onConflictDoUpdate({ target: featureFlag.key, set: { enabled: d.enabled, updatedBy: actor.id, updatedAt: new Date() } });
    await audit(tx, { actorId: actor.id, action: d.enabled ? "feature.on" : "feature.off", targetType: "feature", targetId: d.key });
  });
}

/** Ops staff don't see hospital admin pages while hospitals are switched off. */
export async function staffSeesHospitals(actor: StaffActor) {
  assertStaff(actor);
  return actor.platformRole === "super_admin" || (await featureOn("hospitals"));
}

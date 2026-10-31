import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { category, credential, professionalCategory, professionalProfile, service, user } from "@/db/schema";
import { getDb } from "@/db/client";
import { assertUuid, badRequest, notFound } from "@/lib/errors";
import { audit, enqueue } from "@/modules/platform/outbox";

const modes = z.array(z.enum(["in_person", "virtual", "hybrid"])).max(3);

export const profileInput = z.object({
  headline: z.string().trim().max(160).default(""),
  bio: z.string().trim().max(3000).default(""),
  city: z.string().trim().max(80).default(""),
  yearsExperience: z.number().int().min(0).max(60).default(0),
  languages: z.array(z.string().trim().min(2).max(40)).max(10).default([]),
  deliveryModes: modes.default([]),
  categoryIds: z.array(z.string().uuid()).max(10).default([]),
});

export async function upsertProfessionalProfile(userId: string, input: z.input<typeof profileInput>) {
  const { categoryIds, ...d } = profileInput.parse(input);
  return getDb().transaction(async (tx) => {
    const [p] = await tx
      .insert(professionalProfile)
      .values({ userId, ...d })
      .onConflictDoUpdate({ target: professionalProfile.userId, set: { ...d, updatedAt: new Date() } })
      .returning();
    await tx.delete(professionalCategory).where(eq(professionalCategory.profileId, p.id));
    if (categoryIds.length) await tx.insert(professionalCategory).values(categoryIds.map((categoryId) => ({ profileId: p.id, categoryId })));
    return p;
  });
}

export async function getOwnProfile(userId: string) {
  return getDb().query.professionalProfile.findFirst({ where: eq(professionalProfile.userId, userId) });
}

export const serviceInput = z
  .object({
    categoryId: z.string().uuid(),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(2000).default(""),
    deliveryModes: modes.min(1),
    durationMinutes: z.number().int().min(15).max(60 * 24 * 30),
    priceMinRupees: z.number().min(0),
    priceMaxRupees: z.number().min(0),
  })
  .refine((v) => v.priceMaxRupees >= v.priceMinRupees, { message: "Maximum price must be at least the minimum" });

export async function addService(userId: string, input: z.input<typeof serviceInput>) {
  const d = serviceInput.parse(input);
  const p = await getOwnProfile(userId);
  if (!p) throw badRequest("Create your professional profile first");
  const [row] = await getDb()
    .insert(service)
    .values({
      profileId: p.id,
      categoryId: d.categoryId,
      title: d.title,
      description: d.description,
      deliveryModes: d.deliveryModes,
      durationMinutes: d.durationMinutes,
      priceMinPaise: Math.round(d.priceMinRupees * 100),
      priceMaxPaise: Math.round(d.priceMaxRupees * 100),
    })
    .returning();
  return row;
}

export const credentialInput = z.object({
  name: z.string().trim().min(3).max(200),
  issuer: z.string().trim().max(200).default(""),
  // Path returned by the private Vercel Blob upload (never a public URL).
  blobPath: z.string().trim().min(1).max(500),
});

/** Adds a credential for review and marks the profile as pending verification. */
export async function submitCredential(userId: string, input: z.input<typeof credentialInput>) {
  const d = credentialInput.parse(input);
  const p = await getOwnProfile(userId);
  if (!p) throw badRequest("Create your professional profile first");
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(credential).values({ profileId: p.id, ...d }).returning();
    if (p.verificationStatus === "unverified" || p.verificationStatus === "rejected") {
      await tx.update(professionalProfile).set({ verificationStatus: "pending" }).where(eq(professionalProfile.id, p.id));
    }
    return row;
  });
}

export const reviewInput = z.object({
  decision: z.enum(["approved", "rejected", "info_requested"]),
  note: z.string().trim().max(1000).default(""),
});

/** Platform staff only (checked by the caller). Approving any credential verifies the profile. */
export async function reviewCredential(reviewerId: string, credentialId: string, input: z.input<typeof reviewInput>) {
  const d = reviewInput.parse(input);
  if (d.decision !== "approved" && !d.note) throw badRequest("Add a note so the professional knows what to fix");
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(credential)
      .set({ status: d.decision, reviewNote: d.note || null, reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(eq(credential.id, credentialId))
      .returning();
    if (!row) throw notFound("Credential not found");
    if (d.decision === "approved") {
      await tx.update(professionalProfile).set({ verificationStatus: "verified" }).where(eq(professionalProfile.id, row.profileId));
    } else {
      const approved = await tx.query.credential.findFirst({ where: and(eq(credential.profileId, row.profileId), eq(credential.status, "approved")) });
      if (!approved && d.decision === "rejected") {
        await tx.update(professionalProfile).set({ verificationStatus: "rejected" }).where(eq(professionalProfile.id, row.profileId));
      }
    }
    await audit(tx, { actorId: reviewerId, action: `credential.${d.decision}`, targetType: "credential", targetId: row.id, metadata: { note: d.note } });
    await enqueue(tx, { type: "credential.reviewed", payload: { credentialId: row.id, decision: d.decision } });
    return row;
  });
}

// ---------- M2: the professional's own workspace ----------

async function requireOwnProfile(userId: string) {
  const p = await getOwnProfile(userId);
  if (!p) throw badRequest("Create your professional profile first");
  return p;
}

export async function listCategories() {
  return getDb().select().from(category).orderBy(asc(category.name));
}

export async function getOwnCategoryIds(profileId: string) {
  const rows = await getDb().select({ id: professionalCategory.categoryId }).from(professionalCategory).where(eq(professionalCategory.profileId, profileId));
  return rows.map((r) => r.id);
}

export async function listOwnServices(userId: string) {
  const p = await getOwnProfile(userId);
  if (!p) return [];
  return getDb()
    .select({ service, categoryName: category.name })
    .from(service)
    .innerJoin(category, eq(category.id, service.categoryId))
    .where(eq(service.profileId, p.id))
    .orderBy(desc(service.active), asc(service.title));
}

export async function getOwnService(userId: string, serviceId: string) {
  assertUuid(serviceId, "Service");
  const p = await requireOwnProfile(userId);
  const row = await getDb().query.service.findFirst({ where: and(eq(service.id, serviceId), eq(service.profileId, p.id)) });
  if (!row) throw notFound("Service not found");
  return row;
}

export async function updateService(userId: string, serviceId: string, input: z.input<typeof serviceInput>) {
  const d = serviceInput.parse(input);
  const p = await requireOwnProfile(userId);
  const [row] = await getDb()
    .update(service)
    .set({
      categoryId: d.categoryId,
      title: d.title,
      description: d.description,
      deliveryModes: d.deliveryModes,
      durationMinutes: d.durationMinutes,
      priceMinPaise: Math.round(d.priceMinRupees * 100),
      priceMaxPaise: Math.round(d.priceMaxRupees * 100),
    })
    .where(and(eq(service.id, serviceId), eq(service.profileId, p.id)))
    .returning();
  if (!row) throw notFound("Service not found");
  return row;
}

/** Paused services stay on the profile page as history but are not offered or matched. */
export async function setServiceActive(userId: string, serviceId: string, active: boolean) {
  const p = await requireOwnProfile(userId);
  const [row] = await getDb()
    .update(service)
    .set({ active })
    .where(and(eq(service.id, serviceId), eq(service.profileId, p.id)))
    .returning();
  if (!row) throw notFound("Service not found");
  return row;
}

export async function setDiscoverable(userId: string, discoverable: boolean) {
  const p = await requireOwnProfile(userId);
  await getDb().update(professionalProfile).set({ discoverable, updatedAt: new Date() }).where(eq(professionalProfile.id, p.id));
}

export async function listOwnCredentials(userId: string) {
  const p = await getOwnProfile(userId);
  if (!p) return [];
  // The document path is internal; the professional sees status and notes.
  return getDb()
    .select({
      id: credential.id,
      name: credential.name,
      issuer: credential.issuer,
      status: credential.status,
      reviewNote: credential.reviewNote,
      reviewedAt: credential.reviewedAt,
      createdAt: credential.createdAt,
      hasDocument: sql<boolean>`${credential.blobPath} is not null`,
    })
    .from(credential)
    .where(eq(credential.profileId, p.id))
    .orderBy(desc(credential.createdAt));
}

export const resubmitInput = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  issuer: z.string().trim().max(200).optional(),
  blobPath: z.string().trim().min(1).max(500),
});

/**
 * After "info requested" (or a rejection) the professional uploads a new
 * document for the same credential; it goes back to the review queue.
 */
export async function resubmitCredential(userId: string, credentialId: string, input: z.input<typeof resubmitInput>) {
  const d = resubmitInput.parse(input);
  const p = await requireOwnProfile(userId);
  return getDb().transaction(async (tx) => {
    const cred = await tx.query.credential.findFirst({ where: and(eq(credential.id, credentialId), eq(credential.profileId, p.id)) });
    if (!cred) throw notFound("Credential not found");
    if (cred.status !== "info_requested" && cred.status !== "rejected") throw badRequest("Only credentials that need changes can be resubmitted");
    const [row] = await tx
      .update(credential)
      .set({
        blobPath: d.blobPath,
        ...(d.name ? { name: d.name } : {}),
        ...(d.issuer !== undefined ? { issuer: d.issuer } : {}),
        status: "pending",
        createdAt: new Date(), // re-joins the end of the review queue
      })
      .where(eq(credential.id, cred.id))
      .returning();
    if (p.verificationStatus !== "verified") {
      await tx.update(professionalProfile).set({ verificationStatus: "pending" }).where(eq(professionalProfile.id, p.id));
    }
    await audit(tx, { actorId: userId, action: "credential.resubmit", targetType: "credential", targetId: cred.id, metadata: { previousNote: cred.reviewNote } });
    return row;
  });
}

export type ChecklistItem = { key: string; label: string; done: boolean; href: string };

/** What a new professional still has to do before companies can find them. Pure, so it is easy to test. */
export function profileChecklist(input: {
  profile: { headline: string; bio: string; city: string; languages: string[]; deliveryModes: string[]; verificationStatus: string; discoverable: boolean };
  categoryCount: number;
  activeServiceCount: number;
  credentialCount: number;
}): { items: ChecklistItem[]; percent: number; discoverable: boolean } {
  const { profile: p } = input;
  const items: ChecklistItem[] = [
    { key: "basics", label: "Add a headline, city and short bio", done: Boolean(p.headline && p.city && p.bio.length >= 50), href: "/pro/profile" },
    { key: "languages", label: "Choose your languages and delivery modes", done: p.languages.length > 0 && p.deliveryModes.length > 0, href: "/pro/profile" },
    { key: "categories", label: "Pick the categories you work in", done: input.categoryCount > 0, href: "/pro/profile" },
    { key: "service", label: "Add at least one service with a price range", done: input.activeServiceCount > 0, href: "/pro/services/new" },
    { key: "credential", label: "Upload a credential for review", done: input.credentialCount > 0, href: "/pro/credentials" },
    { key: "verified", label: "Get verified by our team", done: p.verificationStatus === "verified", href: "/pro/credentials" },
  ];
  const percent = Math.round((items.filter((i) => i.done).length / items.length) * 100);
  return { items, percent, discoverable: p.discoverable && items.every((i) => i.done) };
}

export async function getProDashboard(userId: string) {
  const p = await getOwnProfile(userId);
  if (!p) return null;
  const db = getDb();
  const [cats, services, creds] = await Promise.all([
    db.select({ n: count() }).from(professionalCategory).where(eq(professionalCategory.profileId, p.id)),
    db.select({ n: count() }).from(service).where(and(eq(service.profileId, p.id), eq(service.active, true))),
    db.select({ n: count() }).from(credential).where(eq(credential.profileId, p.id)),
  ]);
  return {
    profile: p,
    ...profileChecklist({ profile: p, categoryCount: cats[0]?.n ?? 0, activeServiceCount: services[0]?.n ?? 0, credentialCount: creds[0]?.n ?? 0 }),
  };
}

/**
 * The public profile page. Anyone signed in can see a verified, discoverable
 * professional whose account is in good standing; owners always see their
 * own (with a preview banner). Credential documents are never exposed.
 */
export async function getPublicProfile(viewerId: string | null, profileId: string) {
  assertUuid(profileId, "Profile");
  const db = getDb();
  const [row] = await db
    .select({ p: professionalProfile, name: user.name, image: user.image, suspendedAt: user.suspendedAt, deletedAt: user.deletedAt })
    .from(professionalProfile)
    .innerJoin(user, eq(user.id, professionalProfile.userId))
    .where(eq(professionalProfile.id, profileId));
  if (!row) throw notFound("Profile not found");
  const isOwner = viewerId === row.p.userId;
  const isPublic = row.p.verificationStatus === "verified" && row.p.discoverable && !row.suspendedAt && !row.deletedAt;
  if (!isOwner && !isPublic) throw notFound("Profile not found");
  const [cats, services, creds] = await Promise.all([
    db
      .select({ id: category.id, name: category.name })
      .from(professionalCategory)
      .innerJoin(category, eq(category.id, professionalCategory.categoryId))
      .where(eq(professionalCategory.profileId, profileId)),
    db
      .select({ service, categoryName: category.name })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .where(and(eq(service.profileId, profileId), eq(service.active, true)))
      .orderBy(asc(service.priceMinPaise)),
    db
      .select({ name: credential.name, issuer: credential.issuer })
      .from(credential)
      .where(and(eq(credential.profileId, profileId), eq(credential.status, "approved"))),
  ]);
  return { profile: row.p, name: row.name, image: row.image, isOwner, isPublic, categories: cats, services, credentials: creds };
}

/** userId → professional profile id, for linking to public profiles. */
export async function profileIdsForUsers(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const rows = await getDb()
    .select({ id: professionalProfile.id, userId: professionalProfile.userId })
    .from(professionalProfile)
    .where(inArray(professionalProfile.userId, [...new Set(userIds)]));
  return new Map(rows.map((r) => [r.userId, r.id]));
}

/** Per-category commission override (basis points); null = platform default. Staff only (checked by admin). */
export async function setCategoryCommission(categoryId: string, commissionBps: number | null) {
  const [row] = await getDb().update(category).set({ commissionBps }).where(eq(category.id, categoryId)).returning();
  if (!row) throw notFound("Category not found");
  return row;
}

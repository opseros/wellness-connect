import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { credential, professionalCategory, professionalProfile, service } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, notFound } from "@/lib/errors";
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

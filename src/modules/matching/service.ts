import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { category, credential, matchingWeights, professionalCategory, professionalProfile, requirement, service, user } from "@/db/schema";
import { DEFAULT_WEIGHTS, FACTORS, rankCandidates, type MatchCandidate, type Weights } from "./engine";
import { notFound } from "@/lib/errors";

export async function loadWeights(tx: Tx): Promise<Weights> {
  const row = await tx.query.matchingWeights.findFirst({ where: eq(matchingWeights.id, "default") });
  if (!row) return DEFAULT_WEIGHTS;
  const w = { ...DEFAULT_WEIGHTS };
  for (const k of FACTORS) if (typeof row.weights[k] === "number") w[k] = row.weights[k];
  return w;
}

/** Candidates offering the category (by listing it or by an active service). */
export async function loadCandidates(tx: Tx, categoryId: string): Promise<MatchCandidate[]> {
  const listed = tx.select({ id: professionalCategory.profileId }).from(professionalCategory).where(eq(professionalCategory.categoryId, categoryId));
  const viaService = tx.select({ id: service.profileId }).from(service).where(and(eq(service.categoryId, categoryId), eq(service.active, true)));
  const profiles = await tx
    .select({ p: professionalProfile, name: user.name })
    .from(professionalProfile)
    .innerJoin(user, eq(user.id, professionalProfile.userId))
    .where(
      and(
        sql`(${professionalProfile.id} in (${listed}) or ${professionalProfile.id} in (${viaService}))`,
        // Suspended and removed accounts are never matched.
        isNull(user.suspendedAt),
        isNull(user.deletedAt),
      ),
    );
  if (!profiles.length) return [];
  const ids = profiles.map((r) => r.p.id);

  // Sequential on purpose: queries on one transaction's connection can't run in parallel.
  const cats = await tx.select().from(professionalCategory).where(inArray(professionalCategory.profileId, ids));
  const services = await tx.select().from(service).where(inArray(service.profileId, ids));
  const creds = await tx
      .select({ profileId: credential.profileId, n: sql<number>`count(*)::int` })
      .from(credential)
      .where(and(inArray(credential.profileId, ids), eq(credential.status, "approved")))
      .groupBy(credential.profileId);

  return profiles.map(({ p, name }) => ({
    userId: p.userId,
    name,
    headline: p.headline,
    city: p.city,
    discoverable: p.discoverable,
    verificationStatus: p.verificationStatus,
    yearsExperience: p.yearsExperience,
    languages: p.languages,
    deliveryModes: p.deliveryModes,
    categoryIds: cats.filter((c) => c.profileId === p.id).map((c) => c.categoryId),
    approvedCredentialCount: creds.find((c) => c.profileId === p.id)?.n ?? 0,
    services: services
      .filter((s) => s.profileId === p.id)
      .map((s) => ({ categoryId: s.categoryId, deliveryModes: s.deliveryModes, priceMinPaise: s.priceMinPaise, priceMaxPaise: s.priceMaxPaise, active: s.active })),
  }));
}

/** Runs inside the caller's scoped transaction, so RLS decides if the requirement is visible. */
export async function matchRequirement(tx: Tx, requirementId: string) {
  const req = await tx.query.requirement.findFirst({ where: eq(requirement.id, requirementId) });
  if (!req) throw notFound("Requirement not found");
  const cat = await tx.query.category.findFirst({ where: eq(category.id, req.categoryId) });
  const candidates = await loadCandidates(tx, req.categoryId);
  const weights = await loadWeights(tx);
  const result = rankCandidates(
    {
      categoryId: req.categoryId,
      categoryRequiresCredential: cat?.requiresCredential ?? true,
      city: req.city,
      deliveryMode: req.deliveryMode,
      budgetMinPaise: req.budgetMinPaise,
      budgetMaxPaise: req.budgetMaxPaise,
      mustBeVerified: req.mustBeVerified,
      mustLanguages: req.mustLanguages,
      minYearsExperience: req.minYearsExperience,
    },
    candidates,
    weights,
  );
  return { requirement: req, weights, ...result };
}

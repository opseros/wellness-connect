import { eq } from "drizzle-orm";
import { category, credential, featureFlag, professionalCategory, professionalProfile, service, user } from "@/db/schema";
import type { DB } from "@/db/client";

let n = 0;

export async function makeUser(db: DB, email?: string, name?: string) {
  n++;
  const [u] = await db
    .insert(user)
    .values({ name: name ?? `User ${n}`, email: email ?? `user${n}@example.test`, emailVerified: true })
    .returning();
  return u;
}

export async function categoryBySlug(db: DB, slug: string) {
  const c = await db.query.category.findFirst({ where: eq(category.slug, slug) });
  if (!c) throw new Error(`missing category ${slug}`);
  return c;
}

/** A verified professional with one approved credential and one service. */
export async function makeProfessional(
  db: DB,
  opts: { categoryId: string; city?: string; years?: number; verified?: boolean; priceMin?: number; priceMax?: number; name?: string },
) {
  const u = await makeUser(db, undefined, opts.name);
  const [p] = await db
    .insert(professionalProfile)
    .values({
      userId: u.id,
      headline: "Coach",
      city: opts.city ?? "Bengaluru",
      yearsExperience: opts.years ?? 8,
      languages: ["English"],
      deliveryModes: ["in_person", "virtual"],
      verificationStatus: opts.verified === false ? "pending" : "verified",
    })
    .returning();
  await db.insert(professionalCategory).values({ profileId: p.id, categoryId: opts.categoryId });
  await db.insert(credential).values({ profileId: p.id, name: "Certificate", status: opts.verified === false ? "pending" : "approved" });
  await db.insert(service).values({
    profileId: p.id,
    categoryId: opts.categoryId,
    title: "Workshop",
    deliveryModes: ["in_person", "virtual"],
    durationMinutes: 90,
    priceMinPaise: (opts.priceMin ?? 30_000) * 100,
    priceMaxPaise: (opts.priceMax ?? 45_000) * 100,
  });
  return { user: u, profile: p };
}

/** Platform switches (the migrations start hospitals off). */
export async function setFeature(db: DB, key: string, enabled: boolean) {
  await db.insert(featureFlag).values({ key, enabled }).onConflictDoUpdate({ target: featureFlag.key, set: { enabled } });
}

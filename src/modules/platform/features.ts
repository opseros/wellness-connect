// Platform switches (feature flags) that super admins flip in Admin → Settings.
// Read once per request (React cache). Changing one goes through the admin
// service, which audits it.
import { cache } from "react";
import { eq } from "drizzle-orm";
import { featureFlag, user } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { notFound } from "@/lib/errors";

export const FEATURES = {
  hospitals: {
    label: "Hospitals and Care & Travel",
    description:
      "Hospital directory and pages, hospital sign-up and workspaces, treatment packages, quote requests, medical reports and company health checks. When off, only super admins can see any of it.",
    default: false,
  },
} as const;
export type FeatureKey = keyof typeof FEATURES;

const readFlags = cache(async (): Promise<Record<string, boolean>> => {
  const rows = await getDb().select({ key: featureFlag.key, enabled: featureFlag.enabled }).from(featureFlag);
  return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
});

/** Pass `db` inside a transaction so the read uses the same connection. */
export async function featureOn(key: FeatureKey, db?: Executor): Promise<boolean> {
  if (db) {
    const [r] = await db.select({ enabled: featureFlag.enabled }).from(featureFlag).where(eq(featureFlag.key, key));
    return r?.enabled ?? FEATURES[key].default;
  }
  return (await readFlags())[key] ?? FEATURES[key].default;
}

/** Super admins with two-factor on see switched-off features (to set them up and check them). */
const superAdminCached = cache(async (userId: string): Promise<boolean> => superAdminCheck(userId, getDb()));
async function superAdminCheck(userId: string, db: Executor) {
  const u = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { platformRole: true, twoFactorEnabled: true } });
  return u?.platformRole === "super_admin" && Boolean(u.twoFactorEnabled);
}
export async function isSuperAdmin(userId: string | null | undefined, db?: Executor): Promise<boolean> {
  if (!userId) return false;
  return db ? superAdminCheck(userId, db) : superAdminCached(userId);
}

/** Hospitals and Care & Travel: visible when switched on, or to a super admin. */
export async function hospitalsVisible(userId: string | null | undefined, db?: Executor): Promise<boolean> {
  return (await featureOn("hospitals", db)) || (await isSuperAdmin(userId, db));
}

/**
 * "on": everyone sees hospitals. "preview": switched off, but this viewer is a super admin
 * (show an "Off" label so they know others don't see it). "hidden": switched off.
 */
export async function hospitalsMode(userId: string | null | undefined): Promise<"on" | "preview" | "hidden"> {
  if (await featureOn("hospitals")) return "on";
  return (await isSuperAdmin(userId)) ? "preview" : "hidden";
}

/** Use in services: hidden features look like they don't exist (404). */
export async function assertHospitalsVisible(userId: string | null | undefined) {
  if (!(await hospitalsVisible(userId))) throw notFound("Not found");
}

export async function listFeatures(db: Executor = getDb()) {
  const rows = await db.select().from(featureFlag);
  return (Object.keys(FEATURES) as FeatureKey[]).map((key) => {
    const r = rows.find((x) => x.key === key);
    return { key, ...FEATURES[key], enabled: r?.enabled ?? FEATURES[key].default, updatedAt: r?.updatedAt ?? null, updatedBy: r?.updatedBy ?? null };
  });
}

// Moosam Plus: an optional paid plan for individual members, behind the
// "plus" platform switch (off by default; super admins always see it).
// Connect stays free. Until card payments go live, members join a waitlist.
import { eq, sql } from "drizzle-orm";
import { financeSettings, plusWaitlist } from "@/db/schema";
import { getDb } from "@/db/client";
import { notFound } from "@/lib/errors";
import { featureOn, isSuperAdmin } from "./features";

export const PLUS_PERKS = [
  "Early access to retreats and member events",
  "Priority in buddy matching",
  "A Plus badge on your Connect profile",
];

/** What a member sees about Plus, or null when it's switched off for them. */
export async function plusFor(userId: string) {
  if (!(await featureOn("plus")) && !(await isSuperAdmin(userId))) return null;
  const db = getDb();
  const [s, joined] = await Promise.all([
    db.query.financeSettings.findFirst({ where: eq(financeSettings.id, "default"), columns: { plusPricePaise: true } }),
    db.query.plusWaitlist.findFirst({ where: eq(plusWaitlist.userId, userId) }),
  ]);
  return { pricePaise: s?.plusPricePaise ?? 29900, joined: Boolean(joined), preview: !(await featureOn("plus")) };
}

export async function joinPlusWaitlist(userId: string) {
  if (!(await plusFor(userId))) throw notFound("Not found");
  await getDb().insert(plusWaitlist).values({ userId }).onConflictDoNothing();
  return { joined: true };
}

export async function leavePlusWaitlist(userId: string) {
  await getDb().delete(plusWaitlist).where(eq(plusWaitlist.userId, userId));
  return { joined: false };
}

/** For the admin settings page. */
export async function plusWaitlistCount() {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(plusWaitlist);
  return r.n;
}

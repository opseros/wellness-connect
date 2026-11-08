// Facility plans and passes (part of the listings module). Facilities set
// public prices; members buy plans (with wellness credits for now; card
// payments come with Razorpay). Purchases are personal data: RLS limits them
// to the facility and the member.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { PLAN_KINDS, facilityPlan, listing, organization, planPurchase, user } from "@/db/schema";
import { getDb, withScope, type Tx } from "@/db/client";
import { assertUuid, notFound } from "@/lib/errors";
import { ORG_ADMINS, orgIsLive, requireOrgRole } from "@/modules/organizations/service";

export type PlanKind = (typeof PLAN_KINDS)[number];
export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  monthly: "Monthly membership",
  quarterly: "Quarterly membership",
  classes: "Class pack",
  day_pass: "Day pass",
  session: "Single session",
};
const DEFAULT_DAYS: Record<PlanKind, number> = { monthly: 30, quarterly: 90, classes: 30, day_pass: 1, session: 1 };

async function assertFacilityAdmin(userId: string, orgId: string, tx: Tx) {
  await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
  const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId), columns: { kind: true } });
  if (l?.kind !== "facility") throw notFound("Facility not found");
}

export const planInput = z.object({
  name: z.string().trim().min(2, "Name the plan").max(80),
  kind: z.enum(PLAN_KINDS),
  priceRupees: z.coerce.number().int("Use whole rupees").min(1, "Set a price").max(500_000),
  validDays: z.coerce.number().int().min(1).max(400).optional(),
  details: z.string().trim().max(240).default(""),
});

export async function listOwnPlans(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await assertFacilityAdmin(userId, orgId, tx);
    const plans = await tx.select().from(facilityPlan).where(eq(facilityPlan.orgId, orgId)).orderBy(desc(facilityPlan.active), asc(facilityPlan.pricePaise));
    const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId), columns: { benefitPartner: true } });
    return { plans, benefitPartner: Boolean(l?.benefitPartner) };
  });
}

export async function addPlan(userId: string, orgId: string, input: z.input<typeof planInput>) {
  const d = planInput.parse(input);
  return withScope({ userId, orgId }, async (tx) => {
    await assertFacilityAdmin(userId, orgId, tx);
    const [row] = await tx
      .insert(facilityPlan)
      .values({ orgId, name: d.name, kind: d.kind, pricePaise: d.priceRupees * 100, validDays: d.validDays ?? DEFAULT_DAYS[d.kind], details: d.details })
      .returning();
    return row;
  });
}

/** Stop selling a plan (people who bought it keep it until it ends). */
export async function setPlanActive(userId: string, orgId: string, planId: string, active: boolean) {
  assertUuid(planId, "Plan");
  return withScope({ userId, orgId }, async (tx) => {
    await assertFacilityAdmin(userId, orgId, tx);
    const [row] = await tx.update(facilityPlan).set({ active }).where(and(eq(facilityPlan.id, planId), eq(facilityPlan.orgId, orgId))).returning();
    if (!row) throw notFound("Plan not found");
    return row;
  });
}

/** Opt in or out of company wellness credits. */
export async function setBenefitPartner(userId: string, orgId: string, on: boolean) {
  return withScope({ userId, orgId }, async (tx) => {
    await assertFacilityAdmin(userId, orgId, tx);
    await tx.update(listing).set({ benefitPartner: on, updatedAt: new Date() }).where(eq(listing.orgId, orgId));
    return { benefitPartner: on };
  });
}

/** Plans on sale at a verified, live facility (for its public page). */
export async function publicPlans(orgId: string) {
  return getDb()
    .select({ id: facilityPlan.id, name: facilityPlan.name, kind: facilityPlan.kind, pricePaise: facilityPlan.pricePaise, validDays: facilityPlan.validDays, details: facilityPlan.details })
    .from(facilityPlan)
    .innerJoin(listing, eq(listing.orgId, facilityPlan.orgId))
    .innerJoin(organization, eq(organization.id, facilityPlan.orgId))
    .where(and(eq(facilityPlan.orgId, orgId), eq(facilityPlan.active, true), eq(listing.status, "verified"), eq(listing.kind, "facility"), orgIsLive()))
    .orderBy(asc(facilityPlan.pricePaise));
}

/** A plan someone wants to buy, with its facility's partner status. Only plans on sale at a live, verified facility. */
export async function planForPurchase(planId: string) {
  assertUuid(planId, "Plan");
  const [r] = await getDb()
    .select({ plan: facilityPlan, facilityName: organization.name, benefitPartner: listing.benefitPartner })
    .from(facilityPlan)
    .innerJoin(listing, eq(listing.orgId, facilityPlan.orgId))
    .innerJoin(organization, eq(organization.id, facilityPlan.orgId))
    .where(and(eq(facilityPlan.id, planId), eq(facilityPlan.active, true), eq(listing.status, "verified"), eq(listing.kind, "facility"), orgIsLive()));
  if (!r) throw notFound("Plan not found");
  return r;
}

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

/** Record a purchase inside the payer's transaction (credits module). The tx must be scoped to the member. */
export async function recordPlanPurchase(tx: Tx, input: { userId: string; plan: typeof facilityPlan.$inferSelect; paidWith: "credits" | "card"; idempotencyKey: string }) {
  const plan = input.plan;
  const start = new Date();
  const end = new Date(start.getTime() + (plan.validDays - 1) * 86_400_000);
  const [row] = await tx
    .insert(planPurchase)
    .values({ orgId: plan.orgId, planId: plan.id, userId: input.userId, planName: plan.name, pricePaise: plan.pricePaise, startsOn: ymd(start), endsOn: ymd(end), paidWith: input.paidWith, idempotencyKey: input.idempotencyKey })
    .returning();
  return row;
}

/** Your plans, newest first, with facility names. */
export async function myPlans(userId: string) {
  const rows = await withScope({ userId }, (tx) => tx.select().from(planPurchase).where(eq(planPurchase.userId, userId)).orderBy(desc(planPurchase.createdAt)).limit(100));
  if (!rows.length) return [];
  const orgs = await getDb().select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).where(inArray(organization.id, [...new Set(rows.map((r) => r.orgId))]));
  return rows.map((r) => ({ ...r, facility: orgs.find((o) => o.id === r.orgId) ?? null }));
}

/** People with a plan at this facility (name, plan, dates, how they paid). Never their employer or balance. */
export async function facilityMembers(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await assertFacilityAdmin(userId, orgId, tx);
    return tx
      .select({ id: planPurchase.id, name: user.name, planName: planPurchase.planName, pricePaise: planPurchase.pricePaise, startsOn: planPurchase.startsOn, endsOn: planPurchase.endsOn, paidWith: planPurchase.paidWith, status: planPurchase.status })
      .from(planPurchase)
      .innerJoin(user, eq(user.id, planPurchase.userId))
      .where(eq(planPurchase.orgId, orgId))
      .orderBy(desc(planPurchase.createdAt))
      .limit(200);
  });
}

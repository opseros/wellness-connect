import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import { withScope } from "@/db/client";
import { listing, membership, organization, planPurchase } from "@/db/schema";
import { createListingOrg } from "./service";
import { addPlan, facilityMembers, listOwnPlans, publicPlans, setBenefitPartner, setPlanActive } from "./plans";
import { buyPlanWithCredits, myWallets, recordFundingPayment, savePolicy, companyCredits, facilityMonthStats } from "@/modules/marketplace/credits";
import { listMyBookings } from "@/modules/bookings/service";
import { companyRetreats, requestStay } from "@/modules/stays/service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
type U = { id: string; email: string; emailVerified: boolean };
let owner: U, hr: U, emp: U, other: U, host: U;
let gymId: string, companyId: string, otherCompany: string, stayOrg: string;
let monthly: { id: string }, pass: { id: string };
let k = 0;
const key = () => `plans-${++k}-${Date.now()}`;
const user = async (n: string) => ({ ...(await makeUser(db, `${n}@plans.test`, n)), emailVerified: true });
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  [owner, hr, emp, other, host] = await Promise.all(["Gym Owner", "Hema HR", "Esha Emp", "Omar Other", "Hari Host"].map(user));
  gymId = (await createListingOrg(owner, { kind: "facility", name: "Pulse Fitness", city: "Bengaluru" })).id;
  await db.update(listing).set({ status: "verified", verifiedAt: new Date() }).where(eq(listing.orgId, gymId));
  const [c] = await db.insert(organization).values({ name: "Northwind", slug: "northwind-plans" }).returning();
  companyId = c.id;
  const [o] = await db.insert(organization).values({ name: "Other Co", slug: "other-plans" }).returning();
  otherCompany = o.id;
  await db.insert(membership).values([
    { orgId: companyId, userId: hr.id, role: "wellness_manager", status: "active" },
    { orgId: companyId, userId: emp.id, role: "member", status: "active" },
    { orgId: otherCompany, userId: other.id, role: "owner", status: "active" },
  ]);
  stayOrg = (await createListingOrg(host, { kind: "homestay", name: "Misty Ridge", city: "Coorg" })).id;
  await db
    .update(listing)
    .set({ status: "verified", verifiedAt: new Date(), rooms: 6, maxGuests: 14, priceFromPaise: 4_000_00, state: "Karnataka", cancellationPolicy: "moderate", minNights: 1 })
    .where(eq(listing.orgId, stayOrg));
});
afterAll(() => t.close());

describe("facility plans", () => {
  it("only the facility's admins add plans; members of the public see active plans only", async () => {
    await expect(addPlan(emp.id, gymId, { name: "Monthly", kind: "monthly", priceRupees: 2499 })).rejects.toMatchObject({ status: 403 });
    monthly = await addPlan(owner.id, gymId, { name: "Monthly unlimited", kind: "monthly", priceRupees: 2499, details: "6 am to 10 pm" });
    pass = await addPlan(owner.id, gymId, { name: "Day pass", kind: "day_pass", priceRupees: 399 });
    expect((await listOwnPlans(owner.id, gymId)).plans.map((p) => p.validDays).sort((a, b) => a - b)).toEqual([1, 30]);
    await setPlanActive(owner.id, gymId, pass.id, false);
    expect((await publicPlans(gymId)).map((p) => p.name)).toEqual(["Monthly unlimited"]);
    await setPlanActive(owner.id, gymId, pass.id, true);
  });

  it("credits pay for plans only where the company's policy allows", async () => {
    await savePolicy(hr.id, companyId, { active: true, allowanceRupees: 3000, coverSessions: true, coverFacilities: true, partnersOnly: true });
    const { current } = await companyCredits(hr.id, companyId);
    await withScope({ bypass: true, userId: null }, (tx) => recordFundingPayment(tx, current!.id, null, { reference: "NEFT-PLANS" }));
    // Not a benefit partner yet.
    await expect(buyPlanWithCredits(emp.id, monthly.id, { idempotencyKey: key() })).rejects.toThrow(/isn't a Moosam benefit partner/);
    await setBenefitPartner(owner.id, gymId, true);
    const k1 = key();
    const r = await buyPlanWithCredits(emp.id, monthly.id, { idempotencyKey: k1 });
    expect(await buyPlanWithCredits(emp.id, monthly.id, { idempotencyKey: k1 })).toMatchObject({ purchaseId: r.purchaseId });
    expect((await myWallets(emp.id))[0]).toMatchObject({ usedPaise: 249900, availablePaise: 50100 });
    await expect(buyPlanWithCredits(emp.id, monthly.id, { idempotencyKey: key() })).rejects.toMatchObject({ status: 409 });
    await expect(buyPlanWithCredits(other.id, pass.id, { idempotencyKey: key() })).rejects.toMatchObject({ status: 403 });
  });

  it("the facility sees who bought what; nobody else does", async () => {
    const rows = await facilityMembers(owner.id, gymId);
    expect(rows).toMatchObject([{ name: "Esha Emp", planName: "Monthly unlimited", paidWith: "credits" }]);
    expect(JSON.stringify(rows)).not.toContain("Northwind");
    expect(await facilityMonthStats(owner.id, gymId)).toMatchObject({ activeMembers: 1, soldThisMonth: 1, viaCredits: 1, grossPaise: 249900, feePaise: 12495, netPaise: 237405 });
    await expect(facilityMembers(emp.id, gymId)).rejects.toMatchObject({ status: 403 });
    expect(await withScope({ userId: other.id }, (tx) => tx.select().from(planPurchase))).toHaveLength(0);
  });

  it("shows up in My bookings as an active plan", async () => {
    const b = await listMyBookings(emp.id);
    expect(b[0]).toMatchObject({ kind: "plan", title: "Pulse Fitness", status: "Active", upcoming: true, amountPaise: 249900 });
  });
});

describe("team retreats", () => {
  it("only a company's buyers can book a retreat for it, and only as a retreat", async () => {
    const base = { checkIn: day(20), checkOut: day(22), rooms: 4, guests: 10, billingName: "Northwind" };
    await expect(requestStay(emp, stayOrg, { ...base, purpose: "retreat", forCompany: companyId })).rejects.toMatchObject({ status: 403 });
    await expect(requestStay(hr, stayOrg, { ...base, purpose: "rest", forCompany: companyId })).rejects.toThrow(/team retreats/);
    const s = await requestStay(hr, stayOrg, { ...base, purpose: "retreat", forCompany: companyId });
    expect(s.companyOrgId).toBe(companyId);
  });

  it("the company's buyers see its retreats; other companies don't", async () => {
    expect((await companyRetreats(hr.id, companyId)).map((r) => r.homestay?.name)).toEqual(["Misty Ridge"]);
    await expect(companyRetreats(emp.id, companyId)).rejects.toMatchObject({ status: 403 });
    expect(await companyRetreats(other.id, otherCompany)).toEqual([]);
  });
});

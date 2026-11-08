import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import { withScope } from "@/db/client";
import { creditEntry, membership, organization, service } from "@/db/schema";
import { adminOverview, listDueCreditFundings, listPartners, partnerCounts, recordCreditFunding } from "@/modules/admin/service";
import { cancelSession, getSession, istDay, requestSession, respondToSession, saveBookingSettings, setWeeklyHours } from "@/modules/sessions/service";
import { companyCredits, creditPeriod, ensureFunding, proMonthEarnings, proEarningsByMonth, myCoverage, myWallets, paySessionWithCredits, refundSessionCredits, savePolicy, splitFee } from "./credits";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
type U = { id: string };
let hr: U, emp: U, emp2: U, outsider: U, pro: U;
let orgId: string, paidService: string;
const ops = () => ({ id: staffId, platformRole: "ops" as const, twoFactorEnabled: true });
let staffId: string;
const day = (n: number) => istDay(new Date(Date.now() + n * 86_400_000));
const at = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+05:30`).toISOString();
let k = 0;
const key = () => `credits-test-${++k}-${Date.now()}`;

async function acceptedSession(member: U, dayOffset: number, time: string) {
  const s = await requestSession(member.id, { serviceId: paidService, startsAt: at(day(dayOffset), time), mode: "online", idempotencyKey: key() });
  await respondToSession(pro.id, s.id, { accept: true });
  return s.id;
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  [hr, emp, emp2, outsider] = await Promise.all(["hr", "emp", "emp2", "out"].map((n) => makeUser(db, `${n}@credits.test`)));
  staffId = (await makeUser(db)).id;
  const [org] = await db.insert(organization).values({ name: "Northwind", slug: "northwind-credits" }).returning();
  orgId = org.id;
  await db.insert(membership).values([
    { orgId, userId: hr.id, role: "wellness_manager", status: "active" },
    { orgId, userId: emp.id, role: "member", status: "active" },
    { orgId, userId: emp2.id, role: "member", status: "active" },
  ]);
  const cat = await categoryBySlug(db, "yoga-mindfulness");
  const p = await makeProfessional(db, { categoryId: cat.id });
  pro = p.user;
  const [s] = await db
    .insert(service)
    .values({ profileId: p.profile.id, categoryId: cat.id, title: "1:1 yoga", deliveryModes: ["virtual"], durationMinutes: 60, priceMinPaise: 100000, priceMaxPaise: 100000, memberPricePaise: 120000 })
    .returning();
  paidService = s.id;
  await saveBookingSettings(pro.id, { enabled: true, minNoticeHours: 1, maxDaysAhead: 30, bufferMinutes: 0, meetingLink: "https://meet.example.com/x" });
  await setWeeklyHours(pro.id, [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, start: "06:00", end: "21:00" })));
});
afterAll(() => t.close());

describe("policy and prepayment", () => {
  it("splits Moosam's 5% fee in whole paise", () => {
    expect(splitFee(120000, 500)).toEqual({ feePaise: 6000, payablePaise: 114000 });
    expect(splitFee(99999, 500)).toEqual({ feePaise: 5000, payablePaise: 94999 });
  });

  it("only buyers set the policy; switching on needs an allowance and a category", async () => {
    await expect(savePolicy(emp.id, orgId, { active: true, allowanceRupees: 2000, coverSessions: true })).rejects.toMatchObject({ status: 403 });
    await expect(savePolicy(hr.id, orgId, { active: true, allowanceRupees: 0, coverSessions: true })).rejects.toThrow(/allowance/);
    await expect(savePolicy(hr.id, orgId, { active: true, allowanceRupees: 2000 })).rejects.toThrow(/at least one/);
    await savePolicy(hr.id, orgId, { active: true, allowanceRupees: 2000, coverSessions: true, coverFacilities: true, partnersOnly: true });
  });

  it("asks the company to prepay seats × allowance, and credits stay off until it's paid", async () => {
    const c = await companyCredits(hr.id, orgId);
    expect(c.current).toMatchObject({ seats: 3, allowancePaise: 200000, requiredPaise: 600000, carriedPaise: 0, duePaise: 600000, status: "due" });
    const [w] = await myWallets(emp.id);
    expect(w).toMatchObject({ funded: false, availablePaise: 0 });
    const id = await acceptedSession(emp, 2, "09:00");
    await expect(paySessionWithCredits(emp.id, id, { idempotencyKey: key() })).rejects.toMatchObject({ status: 403 });
  });

  it("staff record the payment (audited); then each employee has their allowance", async () => {
    const due = await listDueCreditFundings(ops());
    const f = due.find((x) => x.f.orgId === orgId)!.f;
    await expect(recordCreditFunding({ id: emp.id, platformRole: "user", twoFactorEnabled: false } as never, f.id, { reference: "NEFT123456" })).rejects.toMatchObject({ status: 403 });
    await recordCreditFunding(ops(), f.id, { reference: "NEFT123456" });
    await expect(recordCreditFunding(ops(), f.id, { reference: "NEFT123456" })).rejects.toThrow(/already paid/);
    const [w] = await myWallets(emp.id);
    expect(w).toMatchObject({ funded: true, allowancePaise: 200000, availablePaise: 200000 });
    expect(await myCoverage(emp.id)).toMatchObject({ sessions: true, facilities: true, stays: false, partnersOnly: true });
    expect(await myWallets(outsider.id)).toEqual([]);
  });
});

describe("spending", () => {
  let first: string;

  it("pays an accepted session in full, once, and confirms it", async () => {
    first = await acceptedSession(emp, 2, "10:00");
    const k1 = key();
    await paySessionWithCredits(emp.id, first, { idempotencyKey: k1 });
    expect(await paySessionWithCredits(emp.id, first, { idempotencyKey: k1 })).toMatchObject({ paid: true });
    expect((await getSession(emp.id, first)).status).toBe("confirmed");
    const [w] = await myWallets(emp.id);
    expect(w).toMatchObject({ usedPaise: 120000, availablePaise: 80000 });
    const rows = await withScope({ bypass: true, userId: null }, (tx) => tx.select().from(creditEntry).where(eq(creditEntry.refId, first)));
    expect(rows).toMatchObject([{ type: "spend", amountPaise: 120000, feePaise: 6000, payablePaise: 114000, category: "sessions" }]);
  });

  it("refuses when the allowance can't cover the whole price", async () => {
    const second = await acceptedSession(emp, 3, "10:00");
    await expect(paySessionWithCredits(emp.id, second, { idempotencyKey: key() })).rejects.toMatchObject({ status: 409 });
    await expect(paySessionWithCredits(emp2.id, second, { idempotencyKey: key() })).rejects.toMatchObject({ status: 404 });
  });

  it("gives credits back when a paid session is cancelled, only once", async () => {
    await cancelSession(emp.id, first, { reason: "Travelling" });
    await withScope({ bypass: true, userId: null }, async (tx) => {
      await refundSessionCredits(tx, first);
      await refundSessionCredits(tx, first);
    });
    const [w] = await myWallets(emp.id);
    expect(w).toMatchObject({ usedPaise: 0, availablePaise: 200000 });
  });

  it("keeps the ledger append-only and private to the employee", async () => {
    // No UPDATE or DELETE policy exists, so edits touch nothing (and a trigger rejects them for the table owner).
    await withScope({ bypass: true, userId: null }, (tx) => tx.execute(sql`update credit_entry set amount_paise = 1`));
    await withScope({ bypass: true, userId: null }, (tx) => tx.execute(sql`delete from credit_entry`));
    expect((await withScope({ bypass: true, userId: null }, (tx) => tx.select().from(creditEntry).where(eq(creditEntry.amountPaise, 1)))).length).toBe(0);
    expect((await withScope({ bypass: true, userId: null }, (tx) => tx.select().from(creditEntry))).length).toBeGreaterThan(2);
    expect(await withScope({ userId: emp2.id }, (tx) => tx.select().from(creditEntry))).toHaveLength(0);
    expect((await withScope({ userId: emp.id }, (tx) => tx.select().from(creditEntry))).length).toBe(2);
  });
});

describe("what HR sees", () => {
  it("shows totals only, and a category's spend only once 3 people used it", async () => {
    const id = await acceptedSession(emp2, 4, "11:00");
    await paySessionWithCredits(emp2.id, id, { idempotencyKey: key() });
    const e = await proMonthEarnings(pro.id, creditPeriod(new Date(Date.now() + 4 * 86_400_000)));
    expect(e).toMatchObject({ sessions: 1, grossPaise: 120000, feePaise: 6000, netPaise: 114000, feeBps: 500 });
    const byMonth = await proEarningsByMonth(pro.id, 3, new Date(Date.now() + 4 * 86_400_000));
    expect(byMonth.months).toHaveLength(3);
    expect(byMonth.months[0]).toMatchObject({ sessions: 1, netPaise: 114000 });
    expect(byMonth.months.slice(1).every((m) => m.sessions === 0)).toBe(true);
    await expect(adminOverview({ id: emp.id, platformRole: "user", twoFactorEnabled: false } as never)).rejects.toMatchObject({ status: 403 });
    expect(await adminOverview(ops())).toMatchObject({ companies: 1, professionals: 1 });
    expect(await partnerCounts(ops())).toMatchObject({ professional: 1, homestay: 0, facility: 0 });
    expect(await listPartners(ops(), "professional")).toHaveLength(1);
    expect(await listPartners(ops(), "professional", "no-such-name")).toHaveLength(0);
    await expect(listPartners({ id: emp.id, platformRole: "user", twoFactorEnabled: false } as never, "facility")).rejects.toMatchObject({ status: 403 });
    const c = await companyCredits(hr.id, orgId);
    expect(c.usedPaise).toBe(120000);
    expect(c.activePeople).toBe(1);
    expect(c.categories.find((x) => x.category === "sessions")).toMatchObject({ people: 1, netPaise: null });
    expect(JSON.stringify(c)).not.toContain(emp2.id);
    await expect(companyCredits(emp.id, orgId)).rejects.toMatchObject({ status: 403 });
  });

  it("carries unspent money into next month's prepayment", async () => {
    const next = creditPeriod(new Date(Date.now() + 32 * 86_400_000));
    const f = await withScope({ userId: hr.id, orgId }, (tx) => ensureFunding(tx, orgId, next));
    // Paid 6,000 earlier; 1,200 spent → 4,800 still in the pool.
    expect(f).toMatchObject({ requiredPaise: 600000, carriedPaise: 480000, duePaise: 120000, status: "due" });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import { membership, organization } from "@/db/schema";
import { archivePlatformChallenge, createPlatformChallengeAsStaff, listPlatformChallenges } from "@/modules/admin/service";
import {
  addDays,
  archiveCompanyChallenge,
  companyChallenges,
  createCompanyChallenge,
  getChallenge,
  istToday,
  joinChallenge,
  leaveChallenge,
  listChallenges,
  logProgress,
} from "./challenges";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
type U = { id: string };
let hr: U, emp: U, emp2: U, emp3: U, outsider: U, staff: { id: string; platformRole: "ops"; twoFactorEnabled: true };
let orgId: string;
const today = istToday();

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  [hr, emp, emp2, emp3, outsider] = await Promise.all(["hr", "emp", "emp2", "emp3", "out"].map((n) => makeUser(db, `${n}@ch.test`)));
  staff = { id: (await makeUser(db)).id, platformRole: "ops", twoFactorEnabled: true };
  const [org] = await db.insert(organization).values({ name: "Acme", slug: "acme-ch" }).returning();
  orgId = org.id;
  await db.insert(membership).values([
    { orgId, userId: hr.id, role: "wellness_manager", status: "active" },
    { orgId, userId: emp.id, role: "member", status: "active" },
    { orgId, userId: emp2.id, role: "member", status: "active" },
    { orgId, userId: emp3.id, role: "member", status: "active" },
  ]);
});
afterAll(() => t.close());

describe("creating challenges", () => {
  it("staff create platform challenges (audited); members can't", async () => {
    await expect(createPlatformChallengeAsStaff({ id: emp.id, platformRole: "user", twoFactorEnabled: false }, { title: "Steps", unit: "steps", goal: 50000, startsOn: today, endsOn: addDays(today, 6) })).rejects.toMatchObject({ status: 403 });
    const c = await createPlatformChallengeAsStaff(staff, { title: "10k steps week", unit: "steps", goal: 70000, startsOn: addDays(today, -2), endsOn: addDays(today, 4) });
    expect(c).toMatchObject({ orgId: null, dailyMax: 60000 });
    expect((await listPlatformChallenges(staff)).map((x) => x.title)).toContain("10k steps week");
  });

  it("checks dates and goals", async () => {
    await expect(createPlatformChallengeAsStaff(staff, { title: "Backwards", unit: "km", goal: 10, startsOn: today, endsOn: addDays(today, -1) })).rejects.toThrow(/on or after/);
    await expect(createPlatformChallengeAsStaff(staff, { title: "Too long", unit: "km", goal: 10, startsOn: today, endsOn: addDays(today, 60) })).rejects.toThrow(/42 days/);
    await expect(createPlatformChallengeAsStaff(staff, { title: "Over", unit: "km", goal: 10, startsOn: addDays(today, -9), endsOn: addDays(today, -3) })).rejects.toThrow(/already be over/);
    await expect(createPlatformChallengeAsStaff(staff, { title: "Habit", unit: "days", goal: 9, startsOn: today, endsOn: addDays(today, 4) })).rejects.toThrow(/more days/);
  });

  it("only a company's buyers create its challenges, and only its members see them", async () => {
    await expect(createCompanyChallenge(emp.id, orgId, { title: "Acme meditation", unit: "days", goal: 3, startsOn: today, endsOn: addDays(today, 4) })).rejects.toMatchObject({ status: 403 });
    const c = await createCompanyChallenge(hr.id, orgId, { title: "Acme meditation", unit: "days", goal: 3, startsOn: addDays(today, -1), endsOn: addDays(today, 4) });
    expect(c.dailyMax).toBe(1);
    expect((await listChallenges(emp.id)).some((x) => x.id === c.id && x.company)).toBe(true);
    expect((await listChallenges(outsider.id)).some((x) => x.id === c.id)).toBe(false);
    await expect(getChallenge(outsider.id, c.slug)).rejects.toMatchObject({ status: 404 });
    await expect(joinChallenge(outsider.id, c.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("taking part", () => {
  let steps: { id: string; slug: string };
  beforeAll(async () => {
    steps = (await listChallenges(emp.id)).find((x) => x.title === "10k steps week")!;
  });

  it("logs one number per day, within the rules, and finishes at the goal", async () => {
    await expect(logProgress(emp.id, steps.id, { day: today, amount: 5000 })).rejects.toThrow(/Join/);
    await joinChallenge(emp.id, steps.id);
    await expect(logProgress(emp.id, steps.id, { day: addDays(today, 1), amount: 5000 })).rejects.toThrow(/hasn't happened/);
    await expect(logProgress(emp.id, steps.id, { day: addDays(today, -3), amount: 5000 })).rejects.toThrow(/part of this challenge/);
    await expect(logProgress(emp.id, steps.id, { day: today, amount: 70000 })).rejects.toThrow(/most you can log/);
    await logProgress(emp.id, steps.id, { day: addDays(today, -2), amount: 20000 });
    await logProgress(emp.id, steps.id, { day: addDays(today, -1), amount: 25000 });
    expect((await logProgress(emp.id, steps.id, { day: today, amount: 10000 })).total).toBe(55000);
    // Correcting a day replaces it.
    const r = await logProgress(emp.id, steps.id, { day: today, amount: 30000 });
    expect(r).toMatchObject({ total: 75000, completed: true, justCompleted: true });
    const mine = await getChallenge(emp.id, steps.slug);
    expect(mine).toMatchObject({ joined: true, myTotal: 75000, completed: true });
    expect(mine.logs.map((l) => l.amount)).toEqual([20000, 25000, 30000]);
    expect(mine.loggable).toEqual([today, addDays(today, -1), addDays(today, -2)]);
  });

  it("shows only totals, and only once 3 people have joined", async () => {
    await joinChallenge(emp2.id, steps.id);
    await logProgress(emp2.id, steps.id, { day: today, amount: 8000 });
    const two = await getChallenge(emp2.id, steps.slug);
    expect(two).toMatchObject({ participants: 2, together: null, finishers: null, myTotal: 8000 });
    expect(two.logs).toEqual([{ day: today, amount: 8000 }]); // never emp's days
    await joinChallenge(emp3.id, steps.id);
    expect(await getChallenge(emp3.id, steps.slug)).toMatchObject({ participants: 3, together: 83000, finishers: 1, myTotal: 0 });
  });

  it("company buyers see totals for their challenges, never per person", async () => {
    const acme = (await listChallenges(emp.id)).find((x) => x.title === "Acme meditation")!;
    for (const u of [emp, emp2]) {
      await joinChallenge(u.id, acme.id);
      await logProgress(u.id, acme.id, { day: today, amount: 1 });
    }
    await expect(logProgress(emp.id, acme.id, { day: today, amount: 2 })).rejects.toThrow(/most you can log/);
    await expect(companyChallenges(emp.id, orgId)).rejects.toMatchObject({ status: 403 });
    const [stats] = await companyChallenges(hr.id, orgId);
    expect(stats).toMatchObject({ participants: 2, together: null, finishers: null });
    expect(JSON.stringify(stats)).not.toContain(emp.id);
  });

  it("leaving removes your numbers; archived challenges disappear", async () => {
    await leaveChallenge(emp2.id, steps.id);
    expect(await getChallenge(emp3.id, steps.slug)).toMatchObject({ participants: 2, together: null });
    const acme = (await listChallenges(emp.id)).find((x) => x.title === "Acme meditation")!;
    await expect(archiveCompanyChallenge(emp.id, orgId, acme.id)).rejects.toMatchObject({ status: 403 });
    await archiveCompanyChallenge(hr.id, orgId, acme.id);
    expect((await listChallenges(emp.id)).some((x) => x.id === acme.id)).toBe(false);
    await archivePlatformChallenge(staff, steps.id);
    await expect(getChallenge(emp.id, steps.slug)).rejects.toMatchObject({ status: 404 });
  });
});

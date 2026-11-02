import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import { appointment, professionalProfile, service } from "@/db/schema";
import type { DB } from "@/db/client";
import { withScope } from "@/db/client";
import {
  addTimeOff,
  cancelSession,
  freeSlots,
  getSession,
  istDay,
  listMySessions,
  listProSessions,
  requestSession,
  respondToSession,
  saveBookingSettings,
  sessionLifecycleJob,
  setWeeklyHours,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let pro: { id: string }, member: { id: string }, stranger: { id: string }, unverified: { id: string };
let paidService: string, freeService: string, companyOnly: string;
const day = (n: number) => istDay(new Date(Date.now() + n * 86_400_000));
const D3 = day(3);
const at = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+05:30`).toISOString();
let n = 0;
const key = () => `idem-${++n}-${Date.now()}`;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  const cat = await categoryBySlug(db, "yoga-mindfulness");
  const p = await makeProfessional(db, { categoryId: cat.id, name: "Priya Coach" });
  pro = p.user;
  const [s] = await db.select().from(service).where(eq(service.profileId, p.profile.id));
  companyOnly = s.id;
  const [paid] = await db
    .insert(service)
    .values({ profileId: p.profile.id, categoryId: cat.id, title: "1:1 yoga", deliveryModes: ["virtual", "in_person"], durationMinutes: 60, priceMinPaise: 100000, priceMaxPaise: 100000, memberPricePaise: 120000 })
    .returning();
  paidService = paid.id;
  const [free] = await db
    .insert(service)
    .values({ profileId: p.profile.id, categoryId: cat.id, title: "Intro call", deliveryModes: ["virtual"], durationMinutes: 30, priceMinPaise: 0, priceMaxPaise: 0, memberPricePaise: 0 })
    .returning();
  freeService = free.id;
  member = await makeUser(db, "member@example.test", "Kavya Member");
  stranger = await makeUser(db);
  const u = await makeProfessional(db, { categoryId: cat.id, verified: false });
  unverified = u.user;
});
afterAll(() => t.close());

describe("schedule", () => {
  it("only verified professionals can switch bookings on", async () => {
    await expect(saveBookingSettings(unverified.id, { enabled: true, minNoticeHours: 12, maxDaysAhead: 30, bufferMinutes: 0 })).rejects.toThrow(/verified/);
    await saveBookingSettings(pro.id, { enabled: true, minNoticeHours: 12, maxDaysAhead: 30, bufferMinutes: 0, meetingLink: "https://meet.example.com/priya", inPersonAddress: "Studio 4, Indiranagar" });
  });

  it("rejects overlapping or too-short hours", async () => {
    await expect(setWeeklyHours(pro.id, [{ weekday: 1, start: "09:00", end: "12:00" }, { weekday: 1, start: "11:00", end: "13:00" }])).rejects.toThrow(/overlap/);
    await expect(setWeeklyHours(pro.id, [{ weekday: 1, start: "09:00", end: "09:15" }])).rejects.toThrow(/30 minutes/);
    const all = [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, start: "09:00", end: "12:00" }));
    expect(await setWeeklyHours(pro.id, all)).toBe(7);
  });

  it("offers slots inside the hours, after the notice period, and not on days off", async () => {
    const slots = await freeSlots(paidService, D3, 1);
    expect(slots[0].day).toBe(D3);
    expect(slots[0].slots.map((s) => s.label)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
    await addTimeOff(pro.id, day(4));
    expect((await freeSlots(paidService, day(4), 1)).length).toBe(0);
    await expect(freeSlots(companyOnly, D3, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe("requests", () => {
  let first: string;

  it("holds the slot and keeps notes free of contact details", async () => {
    await expect(requestSession(pro.id, { serviceId: paidService, startsAt: at(D3, "09:00"), mode: "online", idempotencyKey: key() })).rejects.toThrow(/own service/);
    await expect(requestSession(member.id, { serviceId: paidService, startsAt: at(D3, "09:00"), mode: "online", note: "Call me on 98450 12345", idempotencyKey: key() })).rejects.toThrow(/phone/);
    await expect(requestSession(member.id, { serviceId: freeService, startsAt: at(D3, "09:00"), mode: "in_person", idempotencyKey: key() })).rejects.toThrow(/in person/);
    const k = key();
    const a = await requestSession(member.id, { serviceId: paidService, startsAt: at(D3, "09:00"), mode: "online", note: "First time trying yoga", idempotencyKey: k });
    first = a.id;
    expect(a).toMatchObject({ status: "requested", pricePaise: 120000, serviceTitle: "1:1 yoga" });
    expect((await requestSession(member.id, { serviceId: paidService, startsAt: at(D3, "09:00"), mode: "online", idempotencyKey: k })).id).toBe(first);
    const left = (await freeSlots(paidService, D3, 1))[0].slots.map((s) => s.label);
    expect(left).toEqual(["10:00", "10:30", "11:00"]);
    await expect(requestSession(stranger.id, { serviceId: paidService, startsAt: at(D3, "09:30"), mode: "online", idempotencyKey: key() })).rejects.toThrow(/no longer free/);
  });

  it("only the member and the professional can see it; details stay hidden until confirmed", async () => {
    await expect(getSession(stranger.id, first)).rejects.toMatchObject({ status: 404 });
    expect(await withScope({ userId: stranger.id }, (tx) => tx.select().from(appointment))).toHaveLength(0);
    const mine = await getSession(member.id, first);
    expect(mine.meetingLink).toBe("");
    const [forPro] = await listProSessions(pro.id);
    expect(forPro).toMatchObject({ memberName: "Kavya Member", meetingLink: "https://meet.example.com/priya" });
  });

  it("accepting a paid session waits for payment; declining frees the slot", async () => {
    await expect(respondToSession(stranger.id, first, { accept: true })).rejects.toMatchObject({ status: 404 });
    const a = await respondToSession(pro.id, first, { accept: true });
    expect(a.status).toBe("accepted");
    expect(a.payBy).not.toBeNull();
    await expect(respondToSession(pro.id, first, { accept: false })).rejects.toThrow(/already been answered/);

    const b = await requestSession(member.id, { serviceId: paidService, startsAt: at(D3, "11:00"), mode: "in_person", idempotencyKey: key() });
    await respondToSession(pro.id, b.id, { accept: false, note: "Fully booked that morning" });
    expect((await freeSlots(paidService, D3, 1))[0].slots.map((s) => s.label)).toContain("11:00");
  });

  it("free sessions are confirmed on acceptance and reveal the meeting link", async () => {
    const c = await requestSession(member.id, { serviceId: freeService, startsAt: at(day(5), "10:00"), mode: "online", idempotencyKey: key() });
    await respondToSession(pro.id, c.id, { accept: true });
    const s = await getSession(member.id, c.id);
    expect(s.status).toBe("confirmed");
    expect(s.meetingLink).toBe("https://meet.example.com/priya");
  });

  it("either side can cancel before the start, which frees the slot", async () => {
    const r = await cancelSession(member.id, first, { reason: "Plans changed" });
    expect(r).toMatchObject({ byPro: false, wasConfirmed: false });
    expect((await freeSlots(paidService, D3, 1))[0].slots.map((s) => s.label)).toContain("09:00");
    await expect(cancelSession(member.id, first)).rejects.toThrow(/can't be cancelled/);
    expect((await listMySessions(member.id)).find((x) => x.id === first)?.status).toBe("cancelled");
  });

  it("expires unanswered requests and completes sessions that have ended", async () => {
    const e = await requestSession(member.id, { serviceId: paidService, startsAt: at(day(6), "10:00"), mode: "online", idempotencyKey: key() });
    const later = new Date(Date.now() + 8 * 86_400_000);
    const r = await sessionLifecycleJob(later);
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect(r.completed).toBeGreaterThanOrEqual(1); // the free intro call
    expect((await getSession(member.id, e.id)).status).toBe("expired");
    expect((await freeSlots(paidService, day(6), 1))[0].slots.map((s) => s.label)).toContain("10:00");
  });

  it("stops offering slots when bookings are switched off", async () => {
    await saveBookingSettings(pro.id, { enabled: false, minNoticeHours: 12, maxDaysAhead: 30, bufferMinutes: 0 });
    expect(await freeSlots(paidService, D3, 1)).toEqual([]);
    await db.update(professionalProfile).set({ discoverable: true }).where(eq(professionalProfile.userId, pro.id));
  });
});

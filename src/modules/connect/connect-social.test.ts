import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import { membership, organization, user } from "@/db/schema";
import { resolveReport } from "@/modules/admin/service";
import {
  AUTO_HIDE_REPORTS,
  DAILY_LIMITS,
  addComment,
  areConnected,
  blockMember,
  checkIn,
  createMeetup,
  createPost,
  getFeed,
  getGroup,
  getPost,
  joinGroup,
  leaveGroup,
  listGroups,
  listUpcomingMeetups,
  peopleYouMet,
  reportContent,
  requestConnection,
  updateMemberProfile,
} from "./service";
import { answerBuddyMatch, buddyOverview, closeBuddyRequest, cityKey, myCircles, pendingBuddyCount, requestBuddy, saveProfileAndCircles, syncCircles } from "./social";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
type U = { id: string };
let asha: U, ben: U, chitra: U, dev: U, esha: U;
const old = async (u: U) => db.update(user).set({ createdAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(user.id, u.id));

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  asha = await makeUser(db, "asha@social.test", "Asha Rao");
  ben = await makeUser(db, "ben@social.test", "Ben Mathew");
  chitra = await makeUser(db, "chitra@social.test", "Chitra Iyer");
  dev = await makeUser(db, "dev@social.test", "Dev Shah");
  esha = await makeUser(db, "esha@social.test", "Esha Nair");
  for (const u of [asha, ben, chitra, dev]) await old(u);
});
afterAll(() => t.close());

describe("circles", () => {
  it("puts members in their city's circle, whatever spelling they use", async () => {
    expect(cityKey("  Bangalore ")).toBe("bengaluru");
    await saveProfileAndCircles(asha.id, { city: "Bangalore" });
    await saveProfileAndCircles(ben.id, { city: "bengaluru" });
    const [c] = await myCircles(asha.id);
    expect(c).toMatchObject({ name: "Bengaluru circle", members: 2, company: false });
    expect((await myCircles(ben.id))[0].id).toBe(c.id);
  });

  it("moves you when you change city; leaving the city circle sticks until then", async () => {
    await saveProfileAndCircles(ben.id, { city: "Mumbai" });
    expect((await myCircles(ben.id)).map((x) => x.name)).toEqual(["Mumbai circle"]);
    const mumbai = (await myCircles(ben.id))[0];
    await leaveGroup(ben.id, mumbai.id);
    await syncCircles(ben.id);
    expect(await myCircles(ben.id)).toHaveLength(0);
    await saveProfileAndCircles(ben.id, { city: "Bengaluru" });
    expect((await myCircles(ben.id))[0].name).toBe("Bengaluru circle");
  });

  it("company circles hold only the company's active members and stay hidden from others", async () => {
    const [org] = await db.insert(organization).values({ name: "Acme Labs", slug: "acme-labs-social" }).returning();
    await db.insert(membership).values([
      { orgId: org.id, userId: asha.id, role: "owner", status: "active" },
      { orgId: org.id, userId: chitra.id, role: "member", status: "pending" },
    ]);
    await syncCircles(asha.id);
    await syncCircles(chitra.id);
    const acme = (await myCircles(asha.id)).find((x) => x.company)!;
    expect(acme).toMatchObject({ name: "Acme Labs circle", members: 1 });
    expect((await myCircles(chitra.id)).some((x) => x.company)).toBe(false);
    expect((await listGroups(dev.id)).some((g) => g.group.id === acme.id)).toBe(false);
    await expect(getGroup(dev.id, acme.slug)).rejects.toMatchObject({ status: 404 });
    await expect(joinGroup(dev.id, acme.id)).rejects.toMatchObject({ status: 403 });
    await expect(leaveGroup(asha.id, acme.id)).rejects.toThrow(/while you work there/);

    // Approved → joins; leaves the company → leaves the circle.
    await db.update(membership).set({ status: "active" }).where(eq(membership.userId, chitra.id));
    await syncCircles(chitra.id);
    expect((await myCircles(chitra.id)).some((x) => x.id === acme.id)).toBe(true);
    await db.delete(membership).where(eq(membership.userId, chitra.id));
    await syncCircles(chitra.id);
    expect((await myCircles(chitra.id)).some((x) => x.id === acme.id)).toBe(false);
  });
});

describe("buddy match", () => {
  it("suggests people for the same activity, city and time, never with contact details", async () => {
    await expect(requestBuddy(asha.id, { activity: "run", city: "Bengaluru", times: ["early"], note: "WhatsApp 98450 12345" })).rejects.toThrow(/phone numbers/);
    const a = await requestBuddy(asha.id, { activity: "run", city: "Bangalore", times: ["early", "weekend"], pace: "easy" });
    expect(a.suggested).toBe(0);
    await requestBuddy(dev.id, { activity: "run", city: "Mumbai", times: ["early"] }); // other city
    await requestBuddy(chitra.id, { activity: "yoga", city: "Bengaluru", times: ["early"] }); // other activity
    const b = await requestBuddy(ben.id, { activity: "run", city: "bengaluru", times: ["weekend"], pace: "easy", note: "5k, slow and chatty" });
    expect(b.suggested).toBe(1);
    expect(await pendingBuddyCount(asha.id)).toBe(1);
    const { matches } = await buddyOverview(asha.id);
    expect(matches[0]).toMatchObject({ activity: "run", firstName: "Ben", sharedTimes: ["weekend"], note: "5k, slow and chatty", otherId: null });
    // Asking again for the same activity updates the request; no duplicate suggestion.
    expect((await requestBuddy(ben.id, { activity: "run", city: "Bengaluru", times: ["weekend", "early"] })).suggested).toBe(0);
  });

  it("connects only after both say yes; one answer never shows to the other side", async () => {
    const id = (await buddyOverview(asha.id)).matches[0].id;
    await expect(answerBuddyMatch(dev.id, id, { answer: "yes" })).rejects.toMatchObject({ status: 404 });
    await answerBuddyMatch(asha.id, id, { answer: "yes" });
    expect(await areConnected(asha.id, ben.id)).toBe(false);
    const forBen = (await buddyOverview(ben.id)).matches[0];
    expect(forBen.myAnswer).toBeNull();
    expect(forBen).not.toHaveProperty("lowAnswer");
    expect((await answerBuddyMatch(ben.id, id, { answer: "yes" })).status).toBe("matched");
    expect(await areConnected(asha.id, ben.id)).toBe(true);
    expect((await buddyOverview(asha.id)).matches[0].otherId).toBe(ben.id);
    await expect(answerBuddyMatch(ben.id, id, { answer: "no" })).rejects.toThrow(/already been settled/);
  });

  it("a no ends it quietly, and blocked people are never suggested", async () => {
    await requestBuddy(dev.id, { activity: "gym", city: "Pune", times: ["evening"] });
    await blockMember(esha.id, dev.id);
    expect((await requestBuddy(esha.id, { activity: "gym", city: "Pune", times: ["evening"] })).suggested).toBe(0);
    const r = await requestBuddy(chitra.id, { activity: "gym", city: "Pune", times: ["evening"] });
    expect(r.suggested).toBe(2); // Dev and Esha: Esha blocked Dev, not Chitra
    const m = (await buddyOverview(dev.id)).matches.find((x) => x.activity === "gym")!;
    await answerBuddyMatch(dev.id, m.id, { answer: "no" });
    expect((await buddyOverview(chitra.id)).matches.some((x) => x.id === m.id)).toBe(false);
    await closeBuddyRequest(chitra.id, r.request.id);
    await expect(closeBuddyRequest(dev.id, r.request.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("meet-up check-ins", () => {
  it("opens check-in 30 minutes before, and shows people you met only to those who checked in", async () => {
    const m = await createMeetup(asha.id, { title: "Cubbon Park walk", eventAt: new Date(Date.now() + 35 * 60_000).toISOString(), place: "Gate 2", city: "Bengaluru" });
    await expect(checkIn(chitra.id, m.id)).rejects.toThrow(/opens 30 minutes/);
    await t.db.execute(`update post set event_at = now() + interval '10 minutes' where id = '${m.id}'`);
    await checkIn(asha.id, m.id);
    await checkIn(chitra.id, m.id);
    await checkIn(dev.id, m.id);
    const met = await peopleYouMet(chitra.id, { postId: m.id });
    expect(met.map((p) => p.name).sort()).toEqual(["Asha Rao", "Dev Shah"]);
    expect(await peopleYouMet(ben.id, { postId: m.id })).toEqual([]);
    expect((await peopleYouMet(chitra.id, { onlyNew: true })).length).toBe(2);
    // Esha says "Bangalore"; the meet-up says "Bengaluru": still near her.
    await updateMemberProfile(esha.id, { city: "Bangalore" });
    expect((await listUpcomingMeetups(esha.id)).some((x) => x.id === m.id)).toBe(true);
    await t.db.execute(`update post set event_at = now() - interval '5 hours' where id = '${m.id}'`);
    await expect(checkIn(ben.id, m.id)).rejects.toThrow(/closed/);
  });
});

describe("safety", () => {
  it("keeps phone numbers and emails out of public posts, comments and intros", async () => {
    await expect(createPost(asha.id, { body: "Ping me at asha@gmail.com" })).rejects.toThrow(/private message/);
    await expect(createPost(asha.id, { body: "Call +91 98450 12345" })).rejects.toThrow(/private message/);
    const p = await createPost(asha.id, { body: "Ran 10k this morning, 2026 personal best!" });
    await expect(addComment(ben.id, p.id, { body: "WhatsApp 9845012345" })).rejects.toThrow(/private message/);
    await expect(updateMemberProfile(asha.id, { intro: "email me: a@b.co" })).rejects.toThrow(/private message/);
  });

  it("new accounts get lower daily limits", async () => {
    const fresh = await makeUser(db);
    for (let i = 0; i < DAILY_LIMITS.post.fresh; i++) await createPost(fresh.id, { body: `Hello ${i}` });
    await expect(createPost(fresh.id, { body: "One more" })).rejects.toMatchObject({ status: 429 });
    const others = await Promise.all(Array.from({ length: DAILY_LIMITS.connection.fresh + 1 }, () => makeUser(db)));
    for (const o of others.slice(0, -1)) await requestConnection(fresh.id, o.id);
    await expect(requestConnection(fresh.id, others.at(-1)!.id)).rejects.toThrow(/first week/);
  });

  it(`hides a post once ${AUTO_HIDE_REPORTS} people report it; staff dismissal brings it back`, async () => {
    const p = await createPost(dev.id, { body: "Buy cheap supplements now" });
    const reporters = [asha, ben, chitra];
    const reports = [];
    for (const r of reporters.slice(0, -1)) reports.push(await reportContent(r.id, { targetType: "post", targetId: p.id, reason: "Spam" }));
    await expect(getPost(asha.id, p.id)).resolves.toBeTruthy();
    reports.push(await reportContent(chitra.id, { targetType: "post", targetId: p.id, reason: "Spam" }));
    await expect(getPost(asha.id, p.id)).rejects.toMatchObject({ status: 404 });
    const own = (await getFeed(dev.id)).find((x) => x.id === p.id);
    expect(own?.hidden).toBe(true);

    const ops = { id: (await makeUser(db)).id, platformRole: "ops" as const, twoFactorEnabled: true };
    await resolveReport(ops, reports[0].id, { action: "dismiss" });
    await expect(getPost(asha.id, p.id)).resolves.toBeTruthy();
    expect((await getFeed(dev.id)).find((x) => x.id === p.id)?.hidden).toBe(false);
    // One decision settles all three reports.
    await expect(resolveReport(ops, reports[2].id, { action: "dismiss" })).rejects.toMatchObject({ status: 404 });
  });
});

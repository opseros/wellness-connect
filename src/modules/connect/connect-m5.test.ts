import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import {
  addComment,
  blockMember,
  createGroup,
  createMeetup,
  createPost,
  createReferral,
  followMember,
  getFeed,
  getGroup,
  getMemberPage,
  joinGroup,
  leaveGroup,
  listComments,
  listConversations,
  listGroups,
  listReferrals,
  listSpaces,
  listUpcomingMeetups,
  moderateMember,
  openConversation,
  reportContent,
  requestConnection,
  sendMessage,
  suggestMembers,
  toggleRsvp,
  unblockMember,
  unreadMessageCount,
  updateMemberProfile,
  updateReferral,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let asha: { id: string }, ben: { id: string }, chitra: { id: string }, dev: { id: string };
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  asha = await makeUser(db, "asha@example.test", "Asha");
  ben = await makeUser(db, "ben@example.test", "Ben");
  chitra = await makeUser(db, "chitra@example.test", "Chitra");
  dev = await makeUser(db, "dev@example.test", "Dev");
  for (const u of [asha, ben, chitra, dev]) await updateMemberProfile(u.id, {});
  await requestConnection(asha.id, ben.id);
  await requestConnection(ben.id, asha.id); // accepts
});
afterAll(() => t.close());

describe("network", () => {
  it("suggests people with shared interests first, never existing connections", async () => {
    await updateMemberProfile(asha.id, { topics: ["running", "mindfulness"], city: "Pune" });
    await updateMemberProfile(chitra.id, { topics: ["Running"], city: "Delhi" });
    await updateMemberProfile(dev.id, { city: "Pune" });
    const s = await suggestMembers(asha.id);
    expect(s.map((x) => x.name)).toEqual(["Chitra", "Dev"]);
    expect(s[0].reason).toBe("1 shared interest");
    expect(s[1].reason).toBe("Also in Pune");
  });

  it("following shows someone's posts without connecting; connections-only profiles stay private", async () => {
    await createPost(chitra.id, { body: "Morning run done" });
    expect((await getFeed(dev.id)).map((p) => p.body)).not.toContain("Morning run done");
    await followMember(dev.id, chitra.id);
    expect((await getFeed(dev.id)).map((p) => p.body)).toContain("Morning run done");
    await updateMemberProfile(chitra.id, { visibility: "connections" });
    expect((await getFeed(dev.id)).map((p) => p.body)).not.toContain("Morning run done");
    const page = await getMemberPage(dev.id, chitra.id);
    expect(page).toMatchObject({ limited: true, city: "", posts: [] });
    await updateMemberProfile(chitra.id, { visibility: "members" });
  });

  it("blocking hides people both ways and stops messages", async () => {
    await sendMessage(asha.id, { toUserId: ben.id, body: "Lunch walk?" });
    await blockMember(ben.id, asha.id);
    await expect(sendMessage(asha.id, { toUserId: ben.id, body: "Hello?" })).rejects.toMatchObject({ status: 404 });
    await expect(getMemberPage(asha.id, ben.id)).rejects.toMatchObject({ status: 404 });
    expect(await listConversations(ben.id)).toHaveLength(0);
    // Blocking also ended the connection, so unblocking doesn't restore messaging.
    await unblockMember(ben.id, asha.id);
    await expect(sendMessage(asha.id, { toUserId: ben.id, body: "Hi again" })).rejects.toMatchObject({ status: 403 });
    await requestConnection(asha.id, ben.id);
    await requestConnection(ben.id, asha.id);
  });
});

describe("messages", () => {
  it("lists conversations with unread counts; opening marks them read; strangers can't open them", async () => {
    await sendMessage(ben.id, { toUserId: asha.id, body: "Yes, 1 pm" });
    await sendMessage(ben.id, { toUserId: asha.id, body: "At the park gate" });
    expect(await unreadMessageCount(asha.id)).toBe(2);
    const [c] = await listConversations(asha.id);
    expect(c).toMatchObject({ otherName: "Ben", unread: 2, lastBody: "At the park gate" });
    await expect(openConversation(chitra.id, c.id)).rejects.toMatchObject({ status: 404 });
    const open = await openConversation(asha.id, c.id);
    expect(open.messages.map((m) => m.body).slice(-2)).toEqual(["Yes, 1 pm", "At the park gate"]);
    expect(open.canReply).toBe(true);
    expect(await unreadMessageCount(asha.id)).toBe(0);
  });
});

describe("groups and spaces", () => {
  it("the six spaces exist and anyone can join them", async () => {
    const spaces = await listSpaces();
    expect(spaces.map((s) => s.group.spaceKey).sort()).toEqual(["career", "food", "meetup", "move", "travel", "wellness"]);
    expect(await joinGroup(dev.id, spaces[0].group.id)).toEqual({ status: "active" });
  });

  it("approval groups: requests, moderation, private posts", async () => {
    const g = await createGroup(asha.id, { name: "Pune run club", privacy: "approval", city: "Pune" });
    await createPost(asha.id, { body: "Route for Sunday", groupId: g.id });
    expect((await getGroup(dev.id, g.slug)).posts).toHaveLength(0);
    await expect(createPost(dev.id, { body: "Hi", groupId: g.id })).rejects.toMatchObject({ status: 403 });
    expect(await joinGroup(dev.id, g.id)).toEqual({ status: "pending" });
    await expect(moderateMember(dev.id, g.id, dev.id, { action: "approve" })).rejects.toMatchObject({ status: 403 });
    expect((await getGroup(asha.id, g.slug)).pending.map((p) => p.name)).toEqual(["Dev"]);
    await moderateMember(asha.id, g.id, dev.id, { action: "approve" });
    expect((await getGroup(dev.id, g.slug)).posts.map((p) => p.body)).toEqual(["Route for Sunday"]);
    await expect(leaveGroup(asha.id, g.id)).rejects.toMatchObject({ status: 400 }); // last moderator
    await moderateMember(asha.id, g.id, dev.id, { action: "make_moderator" });
    await leaveGroup(asha.id, g.id);
    const mine = (await listGroups(dev.id)).find((x) => x.group.id === g.id)!;
    expect(mine).toMatchObject({ myStatus: "active", myRole: "moderator", members: 1 });
  });
});

describe("meet-ups and comments", () => {
  it("creates a meet-up, takes RSVPs and lists it for people nearby", async () => {
    await updateMemberProfile(dev.id, { city: "Pune" });
    await expect(createMeetup(asha.id, { title: "Too soon", eventAt: inHours(0.1), place: "Gate 2", city: "Pune" })).rejects.toMatchObject({ status: 400 });
    const m = await createMeetup(asha.id, { title: "Sunrise walk", eventAt: inHours(48), place: "Vetal hill, gate 2", city: "Pune" });
    const [upcoming] = await listUpcomingMeetups(dev.id); // a stranger in the same city sees it
    expect(upcoming).toMatchObject({ title: "Sunrise walk", going: 1, goingByMe: false });
    expect(await toggleRsvp(dev.id, m.id)).toEqual({ going: true });
    expect((await listUpcomingMeetups(dev.id))[0]).toMatchObject({ going: 2, goingByMe: true });
    expect(await toggleRsvp(dev.id, m.id)).toEqual({ going: false });
  });

  it("comments follow post visibility and blocks", async () => {
    const p = await createPost(asha.id, { body: "Best stretch after a long call?" });
    await addComment(ben.id, p.id, { body: "Doorway chest stretch" });
    await addComment(chitra.id, p.id, { body: "Neck rolls" });
    await blockMember(asha.id, chitra.id);
    await expect(addComment(chitra.id, p.id, { body: "Again" })).rejects.toMatchObject({ status: 404 });
    expect((await listComments(asha.id, p.id)).map((c) => c.body)).toEqual(["Doorway chest stretch"]);
    const r1 = await reportContent(ben.id, { targetType: "post", targetId: p.id, reason: "Spam link" });
    const r2 = await reportContent(ben.id, { targetType: "post", targetId: p.id, reason: "Spam link" });
    expect(r2.id).toBe(r1.id);
  });
});

describe("referrals", () => {
  it("between connected professionals, minimum information, with a status trail", async () => {
    const cat = await categoryBySlug(db, "corporate-nutrition");
    const p1 = await makeProfessional(db, { categoryId: cat.id, name: "Nisha" });
    const p2 = await makeProfessional(db, { categoryId: cat.id, name: "Omar" });
    const input = { toUserId: p2.user.id, categoryId: cat.id, clientLabel: "HR team at a 200-person company", note: "They want a nutrition talk in Feb; I'm booked." };
    await expect(createReferral(p1.user.id, input)).rejects.toMatchObject({ status: 403 }); // not connected
    await requestConnection(p1.user.id, p2.user.id);
    await requestConnection(p2.user.id, p1.user.id);
    await expect(createReferral(asha.id, input)).rejects.toMatchObject({ status: 403 }); // not a professional
    await expect(createReferral(p1.user.id, { ...input, note: "Call Priya on 9876543210 about it" })).rejects.toMatchObject({ status: 400 });
    const r = await createReferral(p1.user.id, input);
    await expect(updateReferral(p1.user.id, r.id, { status: "accepted" })).rejects.toMatchObject({ status: 403 });
    await updateReferral(p2.user.id, r.id, { status: "accepted", note: "Thanks, I'll reach out" });
    await expect(updateReferral(p2.user.id, r.id, { status: "declined" })).rejects.toMatchObject({ status: 400 });
    await updateReferral(p2.user.id, r.id, { status: "completed" });
    const [mine] = await listReferrals(p1.user.id);
    expect(mine.incoming).toBe(false);
    expect(mine.trail.map((e) => e.status)).toEqual(["pending", "accepted", "completed"]);
  });
});

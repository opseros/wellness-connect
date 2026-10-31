import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import {
  connectSnapshot,
  createGroup,
  createMeetup,
  createPost,
  getFeed,
  getPost,
  joinGroup,
  postableGroups,
  requestConnection,
  updateMemberProfile,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let asha: { id: string }, ben: { id: string }, stranger: { id: string };
let groupId: string;

beforeAll(async () => {
  t = await createTestDb();
  asha = await makeUser(t.db, "asha@feed.test", "Asha");
  ben = await makeUser(t.db, "ben@feed.test", "Ben");
  stranger = await makeUser(t.db, "zed@feed.test", "Zed");
  for (const u of [asha, ben, stranger]) await updateMemberProfile(u.id, {});
  await requestConnection(asha.id, ben.id);
  await requestConnection(ben.id, asha.id);
  const g = await createGroup(ben.id, { name: "Pune Runners", privacy: "public" });
  groupId = g.id;
  await joinGroup(asha.id, groupId);
  await createPost(ben.id, { body: "Personal update from Ben" });
  await createPost(ben.id, { body: "Run club recap", groupId });
  await createMeetup(ben.id, { title: "Sunday 10k", eventAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), place: "Vetal Tekdi", city: "Pune", groupId });
});
afterAll(() => t.close());

const bodies = (rows: { body: string; title: string | null }[]) => rows.map((r) => r.title ?? r.body);

describe("feed filters and paging", () => {
  it("shows people, groups or meet-ups on request", async () => {
    expect(bodies(await getFeed(asha.id))).toEqual(["Sunday 10k", "Run club recap", "Personal update from Ben"]);
    expect(bodies(await getFeed(asha.id, { show: "connections" }))).toEqual(["Personal update from Ben"]);
    expect(bodies(await getFeed(asha.id, { show: "spaces" }))).toEqual(["Sunday 10k", "Run club recap"]);
    expect(bodies(await getFeed(asha.id, { show: "meetups" }))).toEqual(["Sunday 10k"]);
    // Unknown filters fall back to everything rather than erroring.
    expect(await getFeed(asha.id, { show: "nope" as "all" })).toHaveLength(3);
  });

  it("pages with a before-cursor", async () => {
    const first = await getFeed(asha.id, { limit: 2 });
    expect(first).toHaveLength(2);
    const rest = await getFeed(asha.id, { limit: 2, before: first[1].createdAt.toISOString() });
    expect(bodies(rest)).toEqual(["Personal update from Ben"]);
  });

  it("a post's own page follows the same visibility rules", async () => {
    const [p] = await getFeed(asha.id, { show: "connections" });
    expect((await getPost(asha.id, p.id)).body).toBe("Personal update from Ben");
    await updateMemberProfile(ben.id, { visibility: "connections" });
    await expect(getPost(stranger.id, p.id)).rejects.toMatchObject({ status: 404 });
    await updateMemberProfile(ben.id, { visibility: "members" });
    expect((await getPost(stranger.id, p.id)).authorName).toBe("Ben");
  });
});

describe("getting started", () => {
  it("tracks profile, interests, a space, three connections and a first post", async () => {
    const s = await connectSnapshot(asha.id);
    expect(s).toMatchObject({ connections: 1, groups: 1, posts: 0 });
    expect(Object.fromEntries(s.steps.map((x) => [x.key, x.done]))).toEqual({ profile: false, interests: false, space: true, people: false, post: false });
    await updateMemberProfile(asha.id, { headline: "Product designer", city: "Pune", topics: ["running"] });
    await createPost(asha.id, { body: "Hello Connect" });
    const after = await connectSnapshot(asha.id);
    expect(after.done).toBe(4);
    expect(after.posts).toBe(1);
  });

  it("offers only groups you're an active member of in the composer", async () => {
    expect((await postableGroups(asha.id)).map((g) => g.name)).toEqual(["Pune Runners"]);
    expect(await postableGroups(stranger.id)).toEqual([]);
  });
});

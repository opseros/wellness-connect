import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import { blockMember, createPost, getFeed, listInvitations, requestConnection, respondToConnection, sendMessage, toggleLike, updateMemberProfile } from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let neha: { id: string }, kavya: { id: string }, arjun: { id: string };

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  neha = await makeUser(db, "neha@example.test", "Neha");
  kavya = await makeUser(db, "kavya@example.test", "Kavya");
  arjun = await makeUser(db, "arjun@example.test", "Arjun");
});
afterAll(() => t.close());

describe("Connect", () => {
  it("messaging is closed until people connect", async () => {
    await expect(sendMessage(neha.id, { toUserId: kavya.id, body: "Hi!" })).rejects.toMatchObject({ status: 403 });
  });

  it("request → invitation → accept", async () => {
    const req = await requestConnection(neha.id, kavya.id);
    expect(req.status).toBe("pending");
    expect((await listInvitations(kavya.id)).map((i) => i.fromUserId)).toEqual([neha.id]);
    await expect(respondToConnection(neha.id, req.id, true)).rejects.toMatchObject({ status: 403 });
    const ok = await respondToConnection(kavya.id, req.id, true);
    expect(ok.status).toBe("accepted");
  });

  it("asking someone who already asked you accepts their request", async () => {
    await requestConnection(arjun.id, neha.id);
    const row = await requestConnection(neha.id, arjun.id);
    expect(row.status).toBe("accepted");
  });

  it("connected members can message; reuses one conversation", async () => {
    const m1 = await sendMessage(neha.id, { toUserId: kavya.id, body: "Thanks for connecting" });
    const m2 = await sendMessage(kavya.id, { toUserId: neha.id, body: "Likewise!" });
    expect(m1.conversationId).toBe(m2.conversationId);
  });

  it("members can open messages to everyone", async () => {
    const stranger = await makeUser(db);
    await updateMemberProfile(stranger.id, { messagesFromConnectionsOnly: false });
    await expect(sendMessage(neha.id, { toUserId: stranger.id, body: "Hello" })).resolves.toBeTruthy();
  });

  it("feed shows own and connections' posts with likes", async () => {
    const p = await createPost(kavya.id, { body: "Wellbeing week ideas?" });
    const stranger = await makeUser(db);
    await createPost(stranger.id, { body: "Not in Neha's feed" });
    expect(await toggleLike(neha.id, p.id)).toEqual({ liked: true });
    const feed = await getFeed(neha.id);
    expect(feed.map((f) => f.body)).toEqual(["Wellbeing week ideas?"]);
    expect(feed[0].likes).toBe(1);
    expect(feed[0].likedByMe).toBe(true);
  });

  it("blocking hides posts and stops messages both ways", async () => {
    await blockMember(neha.id, kavya.id);
    expect(await getFeed(neha.id)).toHaveLength(0);
    await expect(sendMessage(kavya.id, { toUserId: neha.id, body: "hi" })).rejects.toMatchObject({ status: 404 });
  });

  it("can't post into a group you haven't joined", async () => {
    await expect(createPost(neha.id, { body: "x", groupId: crypto.randomUUID() })).rejects.toMatchObject({ status: 403 });
  });
});

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { block, connection, conversation, conversationParticipant, groupMember, memberProfile, message, post, postReaction, user } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { enqueue } from "@/modules/platform/outbox";

const pair = (a: string, b: string) => (a < b ? { userLow: a, userHigh: b } : { userLow: b, userHigh: a });

export async function isBlockedEitherWay(a: string, b: string) {
  const row = await getDb().query.block.findFirst({
    where: or(and(eq(block.blockerId, a), eq(block.blockedId, b)), and(eq(block.blockerId, b), eq(block.blockedId, a))),
  });
  return Boolean(row);
}

/** How `viewer` relates to `other`, for showing the right Connect button. */
export async function connectionState(viewer: string, other: string): Promise<"self" | "none" | "sent" | "received" | "connected"> {
  if (viewer === other) return "self";
  const row = await getDb().query.connection.findFirst({ where: and(eq(connection.userLow, pair(viewer, other).userLow), eq(connection.userHigh, pair(viewer, other).userHigh)) });
  if (row?.status === "accepted") return "connected";
  if (row?.status === "pending") return row.requestedBy === viewer ? "sent" : "received";
  return "none";
}

export async function areConnected(a: string, b: string) {
  const row = await getDb().query.connection.findFirst({ where: and(eq(connection.userLow, pair(a, b).userLow), eq(connection.userHigh, pair(a, b).userHigh)) });
  return row?.status === "accepted";
}

export const profileInput = z.object({
  headline: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  topics: z.array(z.string().trim().min(2).max(40)).max(12).optional(),
  visibility: z.enum(["members", "connections"]).optional(),
  messagesFromConnectionsOnly: z.boolean().optional(),
});

export async function updateMemberProfile(userId: string, input: z.input<typeof profileInput>) {
  const d = profileInput.parse(input);
  const [row] = await getDb()
    .insert(memberProfile)
    .values({ userId, ...d })
    .onConflictDoUpdate({ target: memberProfile.userId, set: { ...d, updatedAt: new Date() } })
    .returning();
  return row;
}

/**
 * Send a connection request. If the other person already asked you,
 * this accepts their request instead of creating a second one.
 */
export async function requestConnection(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) throw badRequest("You can't connect with yourself");
  if (await isBlockedEitherWay(fromUserId, toUserId)) throw notFound("Member not found");
  const target = await getDb().query.user.findFirst({ where: eq(user.id, toUserId) });
  if (!target || target.deletedAt || target.suspendedAt) throw notFound("Member not found");
  const p = pair(fromUserId, toUserId);
  return getDb().transaction(async (tx) => {
    const existing = await tx.query.connection.findFirst({ where: and(eq(connection.userLow, p.userLow), eq(connection.userHigh, p.userHigh)) });
    if (existing?.status === "accepted") return existing;
    if (existing?.status === "pending" && existing.requestedBy !== fromUserId) {
      const [row] = await tx.update(connection).set({ status: "accepted", respondedAt: new Date() }).where(eq(connection.id, existing.id)).returning();
      return row;
    }
    if (existing?.status === "pending") return existing;
    const [row] = existing
      ? await tx.update(connection).set({ status: "pending", requestedBy: fromUserId, createdAt: new Date(), respondedAt: null }).where(eq(connection.id, existing.id)).returning()
      : await tx.insert(connection).values({ ...p, requestedBy: fromUserId }).returning();
    await enqueue(tx, { type: "connection.requested", payload: { connectionId: row.id, fromUserId, toUserId } });
    return row;
  });
}

/** Only the person who received the request can answer it. */
export async function respondToConnection(userId: string, connectionId: string, accept: boolean) {
  const row = await getDb().query.connection.findFirst({ where: eq(connection.id, connectionId) });
  if (!row || (row.userLow !== userId && row.userHigh !== userId)) throw notFound("Request not found");
  if (row.requestedBy === userId) throw forbidden("You sent this request");
  if (row.status !== "pending") throw badRequest("This request was already answered");
  const [updated] = await getDb()
    .update(connection)
    .set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
    .where(eq(connection.id, connectionId))
    .returning();
  return updated;
}

export async function listInvitations(userId: string) {
  return getDb()
    .select({ id: connection.id, fromUserId: connection.requestedBy, name: user.name, headline: memberProfile.headline, createdAt: connection.createdAt })
    .from(connection)
    .innerJoin(user, eq(user.id, connection.requestedBy))
    .leftJoin(memberProfile, eq(memberProfile.userId, connection.requestedBy))
    .where(and(eq(connection.status, "pending"), sql`${connection.requestedBy} <> ${userId}`, or(eq(connection.userLow, userId), eq(connection.userHigh, userId))));
}

export async function connectionIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ low: connection.userLow, high: connection.userHigh })
    .from(connection)
    .where(and(eq(connection.status, "accepted"), or(eq(connection.userLow, userId), eq(connection.userHigh, userId))));
  return rows.map((r) => (r.low === userId ? r.high : r.low));
}

export const postInput = z.object({
  body: z.string().trim().min(1).max(3000),
  title: z.string().trim().max(160).optional(),
  groupId: z.string().uuid().optional(),
});

export async function createPost(authorId: string, input: z.input<typeof postInput>) {
  const d = postInput.parse(input);
  if (d.groupId) {
    const m = await getDb().query.groupMember.findFirst({
      where: and(eq(groupMember.groupId, d.groupId), eq(groupMember.userId, authorId), eq(groupMember.status, "active")),
    });
    if (!m) throw forbidden("Join the group to post in it");
  }
  const [row] = await getDb().insert(post).values({ authorId, body: d.body, title: d.title, groupId: d.groupId }).returning();
  return row;
}

/** Your posts, your connections' posts and posts in your groups, newest first. */
export async function getFeed(userId: string, limit = 30) {
  const db = getDb();
  const friends = await connectionIds(userId);
  const groups = (await db.select({ id: groupMember.groupId }).from(groupMember).where(and(eq(groupMember.userId, userId), eq(groupMember.status, "active")))).map((g) => g.id);
  const blocked = (await db.select({ id: block.blockedId }).from(block).where(eq(block.blockerId, userId))).map((b) => b.id);

  const authorFilter = inArray(post.authorId, [userId, ...friends]);
  const scope = groups.length ? or(authorFilter, inArray(post.groupId, groups)) : authorFilter;
  const rows = await db
    .select({
      id: post.id,
      body: post.body,
      title: post.title,
      groupId: post.groupId,
      createdAt: post.createdAt,
      authorId: post.authorId,
      authorName: user.name,
      authorHeadline: memberProfile.headline,
      likes: sql<number>`(select count(*)::int from ${postReaction} where ${postReaction.postId} = ${post.id})`,
      likedByMe: sql<boolean>`exists(select 1 from ${postReaction} where ${postReaction.postId} = ${post.id} and ${postReaction.userId} = ${userId})`,
    })
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .leftJoin(memberProfile, eq(memberProfile.userId, post.authorId))
    .where(and(isNull(post.deletedAt), scope, blocked.length ? sql`${post.authorId} not in ${blocked}` : undefined))
    .orderBy(desc(post.createdAt))
    .limit(Math.min(limit, 100));
  return rows;
}

export async function toggleLike(userId: string, postId: string) {
  const db = getDb();
  const removed = await db.delete(postReaction).where(and(eq(postReaction.postId, postId), eq(postReaction.userId, userId))).returning();
  if (removed.length) return { liked: false };
  await db.insert(postReaction).values({ postId, userId }).onConflictDoNothing();
  return { liked: true };
}

export const messageInput = z.object({ toUserId: z.string().uuid(), body: z.string().trim().min(1).max(4000) });

/** Messages respect blocks and the recipient's "connections only" setting (on by default). */
export async function sendMessage(fromUserId: string, input: z.input<typeof messageInput>) {
  const d = messageInput.parse(input);
  if (d.toUserId === fromUserId) throw badRequest("You can't message yourself");
  if (await isBlockedEitherWay(fromUserId, d.toUserId)) throw notFound("Member not found");
  const settings = await getDb().query.memberProfile.findFirst({ where: eq(memberProfile.userId, d.toUserId) });
  const connectionsOnly = settings?.messagesFromConnectionsOnly ?? true;
  if (connectionsOnly && !(await areConnected(fromUserId, d.toUserId))) throw forbidden("You can message this member once you're connected");

  return getDb().transaction(async (tx) => {
    const shared = await tx
      .select({ id: conversationParticipant.conversationId })
      .from(conversationParticipant)
      .where(inArray(conversationParticipant.userId, [fromUserId, d.toUserId]))
      .groupBy(conversationParticipant.conversationId)
      .having(sql`count(*) = 2`)
      .limit(1);
    let conversationId = shared[0]?.id;
    if (!conversationId) {
      const [c] = await tx.insert(conversation).values({}).returning();
      conversationId = c.id;
      await tx.insert(conversationParticipant).values([
        { conversationId, userId: fromUserId },
        { conversationId, userId: d.toUserId },
      ]);
    }
    const [m] = await tx.insert(message).values({ conversationId, senderId: fromUserId, body: d.body }).returning();
    return m;
  });
}

export async function blockMember(userId: string, targetId: string) {
  if (userId === targetId) throw badRequest("You can't block yourself");
  await getDb().insert(block).values({ blockerId: userId, blockedId: targetId }).onConflictDoNothing();
}

export async function getMemberProfile(userId: string) {
  return getDb().query.memberProfile.findFirst({ where: eq(memberProfile.userId, userId) });
}

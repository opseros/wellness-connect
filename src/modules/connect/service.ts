import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  block,
  category,
  comment,
  connection,
  conversation,
  conversationParticipant,
  follow,
  group,
  groupMember,
  meetupRsvp,
  memberProfile,
  message,
  post,
  postReaction,
  professionalProfile,
  referral,
  referralEvent,
  report,
  user,
} from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { assertUuid, badRequest, forbidden, notFound } from "@/lib/errors";
import { enqueue } from "@/modules/platform/outbox";

// Connect: the free network every account gets. No RLS here (these are not
// tenant tables); every function checks visibility, blocks and roles itself.

const pair = (a: string, b: string) => (a < b ? { userLow: a, userHigh: b } : { userLow: b, userHigh: a });

/** Only members in good standing take part. */
const activeUser = and(isNull(user.deletedAt), isNull(user.suspendedAt));

export async function isBlockedEitherWay(a: string, b: string, db: Executor = getDb()) {
  const row = await db.query.block.findFirst({
    where: or(and(eq(block.blockerId, a), eq(block.blockedId, b)), and(eq(block.blockerId, b), eq(block.blockedId, a))),
  });
  return Boolean(row);
}

/** Everyone `userId` has blocked or been blocked by (deduplicated per page render when no executor is given). */
async function blockedIds(userId: string, db?: Executor) {
  return db ? queryBlocked(userId, db) : blockedForRender(userId);
}
const blockedForRender = cache((userId: string) => queryBlocked(userId, getDb()));
async function queryBlocked(userId: string, db: Executor) {
  const rows = await db
    .select({ a: block.blockerId, b: block.blockedId })
    .from(block)
    .where(or(eq(block.blockerId, userId), eq(block.blockedId, userId)));
  return rows.map((r) => (r.a === userId ? r.b : r.a));
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

// ---------- Profile ----------

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

/** A member's Connect profile (deduplicated per page render). */
export const getMemberProfile = cache(async (userId: string) => getDb().query.memberProfile.findFirst({ where: eq(memberProfile.userId, userId) }));

/**
 * A member's page as `viewerId` may see it. Blocked either way, removed or
 * suspended → not found. "Connections only" profiles show just the name and
 * headline to others.
 */
export async function getMemberPage(viewerId: string, memberId: string) {
  assertUuid(memberId, "Member");
  const db = getDb();
  const [row] = await db
    .select({ id: user.id, name: user.name, profile: memberProfile })
    .from(user)
    .leftJoin(memberProfile, eq(memberProfile.userId, user.id))
    .where(and(eq(user.id, memberId), activeUser));
  if (!row || (await isBlockedEitherWay(viewerId, memberId))) throw notFound("Member not found");
  const [state, following, followers, connections, pro] = [
    await connectionState(viewerId, memberId),
    Boolean(await db.query.follow.findFirst({ where: and(eq(follow.followerId, viewerId), eq(follow.followeeId, memberId)) })),
    (await db.select({ n: sql<number>`count(*)::int` }).from(follow).where(eq(follow.followeeId, memberId)))[0].n,
    (await connectionIds(memberId)).length,
    await db.query.professionalProfile.findFirst({ where: eq(professionalProfile.userId, memberId) }),
  ];
  const open = state === "self" || state === "connected" || (row.profile?.visibility ?? "members") === "members";
  const posts = open ? await listMemberPosts(viewerId, memberId) : [];
  return {
    id: row.id,
    name: row.name,
    headline: row.profile?.headline ?? "",
    city: open ? (row.profile?.city ?? "") : "",
    jobTitle: open ? (row.profile?.jobTitle ?? "") : "",
    company: open ? (row.profile?.company ?? "") : "",
    topics: open ? (row.profile?.topics ?? []) : [],
    limited: !open,
    state,
    following,
    followers,
    connections,
    canMessage: state === "connected" || (state !== "self" && !(row.profile?.messagesFromConnectionsOnly ?? true)),
    professionalProfileId: pro && pro.verificationStatus === "verified" && pro.discoverable ? pro.id : null,
    posts,
  };
}

// ---------- Connections, follows, blocks ----------

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
  assertUuid(connectionId, "Request");
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

/** Remove a connection, or withdraw a request you sent. */
export async function removeConnection(userId: string, otherId: string) {
  const p = pair(userId, otherId);
  await getDb().delete(connection).where(and(eq(connection.userLow, p.userLow), eq(connection.userHigh, p.userHigh)));
}

/** Pending invitations to me (deduplicated per page render: the nav badge and the page both ask). */
export const listInvitations = cache(async (userId: string) => queryInvitations(userId));
async function queryInvitations(userId: string) {
  return getDb()
    .select({ id: connection.id, fromUserId: connection.requestedBy, name: user.name, headline: memberProfile.headline, createdAt: connection.createdAt })
    .from(connection)
    .innerJoin(user, eq(user.id, connection.requestedBy))
    .leftJoin(memberProfile, eq(memberProfile.userId, connection.requestedBy))
    .where(and(eq(connection.status, "pending"), sql`${connection.requestedBy} <> ${userId}`, or(eq(connection.userLow, userId), eq(connection.userHigh, userId)), activeUser))
    .orderBy(desc(connection.createdAt));
}

export async function listSentRequests(userId: string) {
  const other = sql<string>`case when ${connection.userLow} = ${userId} then ${connection.userHigh} else ${connection.userLow} end`;
  return getDb()
    .select({ id: connection.id, userId: user.id, name: user.name, headline: memberProfile.headline, createdAt: connection.createdAt })
    .from(connection)
    .innerJoin(user, eq(user.id, other))
    .leftJoin(memberProfile, eq(memberProfile.userId, user.id))
    .where(and(eq(connection.status, "pending"), eq(connection.requestedBy, userId)))
    .orderBy(desc(connection.createdAt));
}

export async function connectionIds(userId: string, db: Executor = getDb()): Promise<string[]> {
  const rows = await db
    .select({ low: connection.userLow, high: connection.userHigh })
    .from(connection)
    .where(and(eq(connection.status, "accepted"), or(eq(connection.userLow, userId), eq(connection.userHigh, userId))));
  return rows.map((r) => (r.low === userId ? r.high : r.low));
}

export async function listConnections(userId: string) {
  const ids = await connectionIds(userId);
  if (!ids.length) return [];
  return getDb()
    .select({ id: user.id, name: user.name, headline: memberProfile.headline, city: memberProfile.city })
    .from(user)
    .leftJoin(memberProfile, eq(memberProfile.userId, user.id))
    .where(and(inArray(user.id, ids), activeUser))
    .orderBy(asc(user.name));
}

/**
 * People you may know: shared topics count most, then the same city. Never
 * yourself, people you're already linked to or have asked, or blocked people.
 */
export async function suggestMembers(userId: string, limit = 8) {
  const db = getDb();
  const me = await getMemberProfile(userId);
  const linked = await db
    .select({ low: connection.userLow, high: connection.userHigh })
    .from(connection)
    .where(and(ne(connection.status, "declined"), or(eq(connection.userLow, userId), eq(connection.userHigh, userId))));
  const exclude = [userId, ...linked.map((r) => (r.low === userId ? r.high : r.low)), ...(await blockedIds(userId))];
  const topics = (me?.topics ?? []).map((t) => t.toLowerCase());
  const city = (me?.city ?? "").trim().toLowerCase();
  const shared = topics.length
    ? sql<number>`(select count(*)::int from unnest(${memberProfile.topics}) t where lower(t) in (${sql.join(topics.map((t) => sql`${t}`), sql`, `)}))`
    : sql<number>`0`;
  const sameCity = city ? sql<number>`(case when lower(${memberProfile.city}) = ${city} then 1 else 0 end)` : sql<number>`0`;
  const rows = await db
    .select({ id: user.id, name: user.name, headline: memberProfile.headline, city: memberProfile.city, shared, sameCity })
    .from(user)
    .innerJoin(memberProfile, eq(memberProfile.userId, user.id))
    .where(and(notInArray(user.id, exclude), activeUser, eq(user.emailVerified, true)))
    .orderBy(desc(sql`${shared} * 2 + ${sameCity}`), desc(user.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    reason: r.shared > 0 ? `${r.shared} shared interest${r.shared === 1 ? "" : "s"}` : r.sameCity ? `Also in ${r.city}` : "New on Connect",
  }));
}

export async function followMember(userId: string, targetId: string) {
  assertUuid(targetId, "Member");
  if (userId === targetId) throw badRequest("You can't follow yourself");
  if (await isBlockedEitherWay(userId, targetId)) throw notFound("Member not found");
  await getDb().insert(follow).values({ followerId: userId, followeeId: targetId }).onConflictDoNothing();
}

export async function unfollowMember(userId: string, targetId: string) {
  await getDb().delete(follow).where(and(eq(follow.followerId, userId), eq(follow.followeeId, targetId)));
}

/** Blocking also removes any connection and follows between you. */
export async function blockMember(userId: string, targetId: string) {
  assertUuid(targetId, "Member");
  if (userId === targetId) throw badRequest("You can't block yourself");
  await getDb().transaction(async (tx) => {
    await tx.insert(block).values({ blockerId: userId, blockedId: targetId }).onConflictDoNothing();
    const p = pair(userId, targetId);
    await tx.delete(connection).where(and(eq(connection.userLow, p.userLow), eq(connection.userHigh, p.userHigh)));
    await tx.delete(follow).where(or(and(eq(follow.followerId, userId), eq(follow.followeeId, targetId)), and(eq(follow.followerId, targetId), eq(follow.followeeId, userId))));
  });
}

export async function unblockMember(userId: string, targetId: string) {
  await getDb().delete(block).where(and(eq(block.blockerId, userId), eq(block.blockedId, targetId)));
}

export async function listBlocked(userId: string) {
  return getDb().select({ id: user.id, name: user.name }).from(block).innerJoin(user, eq(user.id, block.blockedId)).where(eq(block.blockerId, userId));
}

// ---------- Posts, meet-ups, comments ----------

export const postInput = z.object({
  body: z.string().trim().min(1, "Write something first").max(3000),
  title: z.string().trim().max(160).optional(),
  groupId: z.string().uuid().optional(),
});

export const meetupInput = z.object({
  title: z.string().trim().min(3, "Give the meet-up a title").max(160),
  body: z.string().trim().max(2000).default(""),
  eventAt: z.string().datetime({ offset: true }),
  place: z.string().trim().min(2, "Where will you meet?").max(200),
  city: z.string().trim().min(2, "Which city?").max(80),
  groupId: z.string().uuid().optional(),
});

async function assertCanPostIn(db: Executor, userId: string, groupId: string | undefined) {
  if (!groupId) return;
  const m = await db.query.groupMember.findFirst({ where: and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId), eq(groupMember.status, "active")) });
  if (!m) throw forbidden("Join the group to post in it");
}

export async function createPost(authorId: string, input: z.input<typeof postInput>) {
  const d = postInput.parse(input);
  await assertCanPostIn(getDb(), authorId, d.groupId);
  const [row] = await getDb().insert(post).values({ authorId, body: d.body, title: d.title, groupId: d.groupId }).returning();
  return row;
}

/** A meet-up is a post with a time and a place. The organiser is going. */
export async function createMeetup(authorId: string, input: z.input<typeof meetupInput>) {
  const d = meetupInput.parse(input);
  const at = new Date(d.eventAt);
  if (at.getTime() < Date.now() + 30 * 60_000) throw badRequest("Pick a time at least 30 minutes from now");
  await assertCanPostIn(getDb(), authorId, d.groupId);
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(post)
      .values({ authorId, kind: "meetup", title: d.title, body: d.body || d.title, eventAt: at, eventPlace: d.place, eventCity: d.city, groupId: d.groupId })
      .returning();
    await tx.insert(meetupRsvp).values({ postId: row.id, userId: authorId });
    return row;
  });
}

/**
 * Who may see a post: not deleted, author in good standing and not blocked
 * either way; a group post needs a public group or membership; a personal
 * post needs to be yours, a connection's, or from someone whose profile is
 * open to members.
 */
function visiblePostsFor(viewerId: string, blocked: string[], friends: string[], groupIds: string[]): SQL {
  const groupOk = or(
    sql`exists(select 1 from ${group} g where g.id = ${post.groupId} and g.privacy = 'public' and g.archived_at is null)`,
    groupIds.length ? inArray(post.groupId, groupIds) : sql`false`,
  )!;
  const personalOk = or(
    eq(post.authorId, viewerId),
    friends.length ? inArray(post.authorId, friends) : sql`false`,
    sql`coalesce((select mp.visibility from ${memberProfile} mp where mp.user_id = ${post.authorId}), 'members') = 'members'`,
  )!;
  return and(
    isNull(post.deletedAt),
    activeUser,
    blocked.length ? notInArray(post.authorId, blocked) : undefined,
    sql`(case when ${post.groupId} is null then ${personalOk} else ${groupOk} end)`,
  )!;
}

async function viewerContext(viewerId: string) {
  const db = getDb();
  const friends = await connectionIds(viewerId);
  const groups = (await db.select({ id: groupMember.groupId }).from(groupMember).where(and(eq(groupMember.userId, viewerId), eq(groupMember.status, "active")))).map((g) => g.id);
  const followed = (await db.select({ id: follow.followeeId }).from(follow).where(eq(follow.followerId, viewerId))).map((f) => f.id);
  const blocked = await blockedIds(viewerId);
  return { friends, groups, followed, blocked };
}

function postColumns(viewerId: string) {
  return {
    id: post.id,
    kind: post.kind,
    body: post.body,
    title: post.title,
    groupId: post.groupId,
    groupName: sql<string | null>`(select g.name from ${group} g where g.id = ${post.groupId})`,
    groupSlug: sql<string | null>`(select g.slug from ${group} g where g.id = ${post.groupId})`,
    eventAt: post.eventAt,
    eventPlace: post.eventPlace,
    eventCity: post.eventCity,
    createdAt: post.createdAt,
    authorId: post.authorId,
    authorName: user.name,
    authorHeadline: memberProfile.headline,
    likes: sql<number>`(select count(*)::int from ${postReaction} where ${postReaction.postId} = ${post.id})`,
    likedByMe: sql<boolean>`exists(select 1 from ${postReaction} where ${postReaction.postId} = ${post.id} and ${postReaction.userId} = ${viewerId})`,
    comments: sql<number>`(select count(*)::int from ${comment} where ${comment.postId} = ${post.id} and ${comment.deletedAt} is null)`,
    going: sql<number>`(select count(*)::int from ${meetupRsvp} where ${meetupRsvp.postId} = ${post.id})`,
    goingByMe: sql<boolean>`exists(select 1 from ${meetupRsvp} where ${meetupRsvp.postId} = ${post.id} and ${meetupRsvp.userId} = ${viewerId})`,
  };
}

/** Yours, your connections', people you follow, and your groups' posts, newest first. */
export async function getFeed(userId: string, limit = 30) {
  const ctx = await viewerContext(userId);
  const authors = [userId, ...ctx.friends, ...ctx.followed];
  const scope = or(inArray(post.authorId, authors), ctx.groups.length ? inArray(post.groupId, ctx.groups) : sql`false`);
  return getDb()
    .select(postColumns(userId))
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .leftJoin(memberProfile, eq(memberProfile.userId, post.authorId))
    .where(and(scope, visiblePostsFor(userId, ctx.blocked, ctx.friends, ctx.groups)))
    .orderBy(desc(post.createdAt))
    .limit(Math.min(limit, 100));
}

async function listMemberPosts(viewerId: string, memberId: string) {
  const ctx = await viewerContext(viewerId);
  return getDb()
    .select(postColumns(viewerId))
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .leftJoin(memberProfile, eq(memberProfile.userId, post.authorId))
    .where(and(eq(post.authorId, memberId), visiblePostsFor(viewerId, ctx.blocked, ctx.friends, ctx.groups)))
    .orderBy(desc(post.createdAt))
    .limit(20);
}

/** Upcoming meet-ups you can see: from your network and groups, plus open ones in your city. */
export async function listUpcomingMeetups(userId: string, limit = 30) {
  const ctx = await viewerContext(userId);
  const me = await getMemberProfile(userId);
  const city = (me?.city ?? "").trim().toLowerCase();
  const scope = or(
    inArray(post.authorId, [userId, ...ctx.friends, ...ctx.followed]),
    ctx.groups.length ? inArray(post.groupId, ctx.groups) : sql`false`,
    city ? sql`lower(${post.eventCity}) = ${city}` : sql`false`,
  );
  return getDb()
    .select(postColumns(userId))
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .leftJoin(memberProfile, eq(memberProfile.userId, post.authorId))
    .where(and(eq(post.kind, "meetup"), gte(post.eventAt, new Date()), scope, visiblePostsFor(userId, ctx.blocked, ctx.friends, ctx.groups)))
    .orderBy(asc(post.eventAt))
    .limit(limit);
}

/** Throws not-found unless the viewer may see the post. */
async function requireVisiblePost(viewerId: string, postId: string) {
  assertUuid(postId, "Post");
  const ctx = await viewerContext(viewerId);
  const [row] = await getDb()
    .select({ id: post.id, kind: post.kind, authorId: post.authorId, groupId: post.groupId, eventAt: post.eventAt })
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .where(and(eq(post.id, postId), visiblePostsFor(viewerId, ctx.blocked, ctx.friends, ctx.groups)));
  if (!row) throw notFound("Post not found");
  return row;
}

export async function toggleLike(userId: string, postId: string) {
  await requireVisiblePost(userId, postId);
  const db = getDb();
  const removed = await db.delete(postReaction).where(and(eq(postReaction.postId, postId), eq(postReaction.userId, userId))).returning();
  if (removed.length) return { liked: false };
  await db.insert(postReaction).values({ postId, userId }).onConflictDoNothing();
  return { liked: true };
}

/** "I'm going" on a meet-up; again to cancel. Past meet-ups can't change. */
export async function toggleRsvp(userId: string, postId: string) {
  const p = await requireVisiblePost(userId, postId);
  if (p.kind !== "meetup") throw badRequest("Only meet-ups take RSVPs");
  if (p.eventAt && p.eventAt < new Date()) throw badRequest("This meet-up has already happened");
  const db = getDb();
  const removed = await db.delete(meetupRsvp).where(and(eq(meetupRsvp.postId, postId), eq(meetupRsvp.userId, userId))).returning();
  if (removed.length) return { going: false };
  await db.insert(meetupRsvp).values({ postId, userId }).onConflictDoNothing();
  return { going: true };
}

export const commentInput = z.object({ body: z.string().trim().min(1, "Write a comment").max(1500) });

export async function addComment(userId: string, postId: string, input: z.input<typeof commentInput>) {
  const { body } = commentInput.parse(input);
  const p = await requireVisiblePost(userId, postId);
  if (p.groupId) await assertCanPostIn(getDb(), userId, p.groupId);
  const [row] = await getDb().insert(comment).values({ postId, authorId: userId, body }).returning();
  return row;
}

export async function listComments(userId: string, postId: string) {
  await requireVisiblePost(userId, postId);
  const blocked = await blockedIds(userId);
  return getDb()
    .select({ id: comment.id, body: comment.body, createdAt: comment.createdAt, authorId: comment.authorId, authorName: user.name })
    .from(comment)
    .innerJoin(user, eq(user.id, comment.authorId))
    .where(and(eq(comment.postId, postId), isNull(comment.deletedAt), activeUser, blocked.length ? notInArray(comment.authorId, blocked) : undefined))
    .orderBy(asc(comment.createdAt))
    .limit(200);
}

/** Comments for several posts at once (the feed shows the latest few). */
export async function commentsForPosts(userId: string, postIds: string[], perPost = 3) {
  if (!postIds.length) return new Map<string, { id: string; body: string; authorId: string; authorName: string; createdAt: Date }[]>();
  const blocked = await blockedIds(userId);
  const rows = await getDb()
    .select({ id: comment.id, postId: comment.postId, body: comment.body, createdAt: comment.createdAt, authorId: comment.authorId, authorName: user.name })
    .from(comment)
    .innerJoin(user, eq(user.id, comment.authorId))
    .where(and(inArray(comment.postId, postIds), isNull(comment.deletedAt), activeUser, blocked.length ? notInArray(comment.authorId, blocked) : undefined))
    .orderBy(asc(comment.createdAt));
  const map = new Map<string, typeof rows>();
  for (const r of rows) map.set(r.postId, [...(map.get(r.postId) ?? []), r]);
  return new Map([...map].map(([k, v]) => [k, v.slice(-perPost)]));
}

/** Authors delete their own posts and comments; group moderators can remove them in their group. */
export async function deletePost(userId: string, postId: string) {
  assertUuid(postId, "Post");
  const p = await getDb().query.post.findFirst({ where: and(eq(post.id, postId), isNull(post.deletedAt)) });
  if (!p) throw notFound("Post not found");
  if (p.authorId !== userId && !(p.groupId && (await isModerator(userId, p.groupId)))) throw forbidden();
  await getDb().update(post).set({ deletedAt: new Date() }).where(eq(post.id, postId));
}

export async function deleteComment(userId: string, commentId: string) {
  assertUuid(commentId, "Comment");
  const [c] = await getDb().select({ c: comment, groupId: post.groupId }).from(comment).innerJoin(post, eq(post.id, comment.postId)).where(and(eq(comment.id, commentId), isNull(comment.deletedAt)));
  if (!c) throw notFound("Comment not found");
  if (c.c.authorId !== userId && !(c.groupId && (await isModerator(userId, c.groupId)))) throw forbidden();
  await getDb().update(comment).set({ deletedAt: new Date() }).where(eq(comment.id, commentId));
}

// ---------- Reports ----------

export const reportInput = z.object({
  targetType: z.enum(["post", "comment", "message", "user", "group"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3, "Tell us briefly what's wrong").max(500),
});

/** Reports go to the admin portal's queue. One open report per person per item. */
export async function reportContent(userId: string, input: z.input<typeof reportInput>) {
  const d = reportInput.parse(input);
  const existing = await getDb().query.report.findFirst({
    where: and(eq(report.reporterId, userId), eq(report.targetType, d.targetType), eq(report.targetId, d.targetId), eq(report.status, "open")),
  });
  if (existing) return existing;
  const [row] = await getDb().insert(report).values({ reporterId: userId, ...d }).returning();
  return row;
}

// ---------- Messages ----------

export const messageInput = z.object({ toUserId: z.string().uuid(), body: z.string().trim().min(1, "Write a message").max(4000) });

/** Can `from` message `to` right now? Checked on every send. */
async function assertCanMessage(fromUserId: string, toUserId: string) {
  if (toUserId === fromUserId) throw badRequest("You can't message yourself");
  if (await isBlockedEitherWay(fromUserId, toUserId)) throw notFound("Member not found");
  const target = await getDb().query.user.findFirst({ where: eq(user.id, toUserId) });
  if (!target || target.deletedAt || target.suspendedAt) throw notFound("Member not found");
  const settings = await getDb().query.memberProfile.findFirst({ where: eq(memberProfile.userId, toUserId) });
  const connectionsOnly = settings?.messagesFromConnectionsOnly ?? true;
  if (connectionsOnly && !(await areConnected(fromUserId, toUserId))) throw forbidden("You can message this member once you're connected");
}

/** Messages respect blocks and the recipient's "connections only" setting (on by default). */
export async function sendMessage(fromUserId: string, input: z.input<typeof messageInput>) {
  const d = messageInput.parse(input);
  await assertCanMessage(fromUserId, d.toUserId);
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
    const now = new Date();
    const [m] = await tx.insert(message).values({ conversationId, senderId: fromUserId, body: d.body, createdAt: now }).returning();
    // Sending counts as reading everything up to your own message.
    await tx.update(conversationParticipant).set({ lastReadAt: now }).where(and(eq(conversationParticipant.conversationId, conversationId), eq(conversationParticipant.userId, fromUserId)));
    return m;
  });
}

/** Your conversations, most recent first, with the other person and an unread count. */
export async function listConversations(userId: string) {
  const db = getDb();
  const mine = db.select({ id: conversationParticipant.conversationId }).from(conversationParticipant).where(eq(conversationParticipant.userId, userId));
  const rows = await db
    .select({
      id: conversationParticipant.conversationId,
      otherId: user.id,
      otherName: user.name,
      otherActive: sql<boolean>`${user.deletedAt} is null and ${user.suspendedAt} is null`,
      lastBody: sql<string | null>`(select m.body from ${message} m where m.conversation_id = ${conversationParticipant.conversationId} order by m.created_at desc limit 1)`,
      lastAt: sql<Date | null>`(select max(m.created_at) from ${message} m where m.conversation_id = ${conversationParticipant.conversationId})`,
      unread: sql<number>`(select count(*)::int from ${message} m join ${conversationParticipant} me on me.conversation_id = m.conversation_id and me.user_id = ${userId}
              where m.conversation_id = ${conversationParticipant.conversationId} and m.sender_id <> ${userId} and (me.last_read_at is null or m.created_at > me.last_read_at))`,
    })
    .from(conversationParticipant)
    .innerJoin(user, eq(user.id, conversationParticipant.userId))
    .where(and(inArray(conversationParticipant.conversationId, mine), ne(conversationParticipant.userId, userId)));
  const blocked = new Set(await blockedIds(userId));
  return rows
    .filter((r) => r.lastAt && !blocked.has(r.otherId))
    .map((r) => ({ ...r, lastAt: r.lastAt ? new Date(r.lastAt) : null }))
    .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
}

export async function unreadMessageCount(userId: string) {
  const [r] = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from ${message} m
    join ${conversationParticipant} me on me.conversation_id = m.conversation_id and me.user_id = ${userId}
    where m.sender_id <> ${userId} and (me.last_read_at is null or m.created_at > me.last_read_at)
      and not exists (select 1 from ${block} b where (b.blocker_id = ${userId} and b.blocked_id = m.sender_id) or (b.blocker_id = m.sender_id and b.blocked_id = ${userId}))`).then((x) => (Array.isArray(x) ? x : x.rows) as { n: number }[]);
  return Number(r?.n ?? 0);
}

/** One conversation's messages; opening it marks it read. Participants only. */
export async function openConversation(userId: string, conversationId: string) {
  assertUuid(conversationId, "Conversation");
  const db = getDb();
  const me = await db.query.conversationParticipant.findFirst({ where: and(eq(conversationParticipant.conversationId, conversationId), eq(conversationParticipant.userId, userId)) });
  if (!me) throw notFound("Conversation not found");
  const [other] = await db
    .select({ id: user.id, name: user.name })
    .from(conversationParticipant)
    .innerJoin(user, eq(user.id, conversationParticipant.userId))
    .where(and(eq(conversationParticipant.conversationId, conversationId), ne(conversationParticipant.userId, userId)));
  if (!other || (await isBlockedEitherWay(userId, other.id))) throw notFound("Conversation not found");
  const messages = await db
    .select({ id: message.id, body: message.body, senderId: message.senderId, createdAt: message.createdAt })
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt))
    .limit(500);
  await db.update(conversationParticipant).set({ lastReadAt: new Date() }).where(and(eq(conversationParticipant.conversationId, conversationId), eq(conversationParticipant.userId, userId)));
  let canReply = true;
  try {
    await assertCanMessage(userId, other.id);
  } catch {
    canReply = false;
  }
  return { other, messages, canReply };
}

/** The conversation with a person, if there is one (for "Message" buttons). */
export async function conversationWith(userId: string, otherId: string) {
  const [row] = await getDb()
    .select({ id: conversationParticipant.conversationId })
    .from(conversationParticipant)
    .where(inArray(conversationParticipant.userId, [userId, otherId]))
    .groupBy(conversationParticipant.conversationId)
    .having(sql`count(*) = 2`)
    .limit(1);
  return row?.id ?? null;
}

// ---------- Groups and spaces ----------

async function isModerator(userId: string, groupId: string) {
  const m = await getDb().query.groupMember.findFirst({
    where: and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId), eq(groupMember.status, "active"), eq(groupMember.role, "moderator")),
  });
  return Boolean(m);
}

const memberCount = sql<number>`(select count(*)::int from ${groupMember} gm where gm.group_id = ${group.id} and gm.status = 'active')`;

/** Spaces first, then communities; with your membership. */
export async function listGroups(userId: string) {
  return getDb()
    .select({
      group,
      members: memberCount,
      myStatus: sql<string | null>`(select gm.status from ${groupMember} gm where gm.group_id = ${group.id} and gm.user_id = ${userId})`,
      myRole: sql<string | null>`(select gm.role from ${groupMember} gm where gm.group_id = ${group.id} and gm.user_id = ${userId})`,
    })
    .from(group)
    .where(isNull(group.archivedAt))
    .orderBy(desc(sql`${group.kind} = 'space'`), desc(memberCount), asc(group.name));
}

export const groupInput = z.object({
  name: z.string().trim().min(3, "Name the group").max(80),
  about: z.string().trim().max(600).default(""),
  privacy: z.enum(["public", "approval"]).default("public"),
  city: z.string().trim().max(80).default(""),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "group";

/** Anyone can start a community; the creator is its first moderator. */
export async function createGroup(userId: string, input: z.input<typeof groupInput>) {
  const d = groupInput.parse(input);
  return getDb().transaction(async (tx) => {
    const [g] = await tx
      .insert(group)
      .values({ ...d, kind: "community", slug: `${slugify(d.name)}-${crypto.randomUUID().slice(0, 6)}`, createdBy: userId })
      .returning();
    await tx.insert(groupMember).values({ groupId: g.id, userId, role: "moderator", status: "active" });
    return g;
  });
}

export async function getGroup(userId: string, slug: string) {
  const g = await getDb().query.group.findFirst({ where: and(eq(group.slug, slug), isNull(group.archivedAt)) });
  if (!g) throw notFound("Group not found");
  const me = await getDb().query.groupMember.findFirst({ where: and(eq(groupMember.groupId, g.id), eq(groupMember.userId, userId)) });
  const isMember = me?.status === "active";
  const canSee = g.privacy === "public" || isMember;
  const ctx = await viewerContext(userId);
  const posts = canSee
    ? await getDb()
        .select(postColumns(userId))
        .from(post)
        .innerJoin(user, eq(user.id, post.authorId))
        .leftJoin(memberProfile, eq(memberProfile.userId, post.authorId))
        .where(and(eq(post.groupId, g.id), visiblePostsFor(userId, ctx.blocked, ctx.friends, ctx.groups)))
        .orderBy(desc(post.createdAt))
        .limit(40)
    : [];
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(groupMember).where(and(eq(groupMember.groupId, g.id), eq(groupMember.status, "active")));
  const moderator = me?.status === "active" && me.role === "moderator";
  const pending = moderator
    ? await getDb()
        .select({ userId: user.id, name: user.name, createdAt: groupMember.createdAt })
        .from(groupMember)
        .innerJoin(user, eq(user.id, groupMember.userId))
        .where(and(eq(groupMember.groupId, g.id), eq(groupMember.status, "pending")))
    : [];
  const moderators = await getDb()
    .select({ userId: user.id, name: user.name })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.userId))
    .where(and(eq(groupMember.groupId, g.id), eq(groupMember.role, "moderator"), eq(groupMember.status, "active")));
  return { group: g, members: n, myStatus: me?.status ?? null, isMember, moderator, canSee, posts, pending, moderators };
}

/** Public groups and spaces: join at once. Approval groups: a request moderators answer. */
export async function joinGroup(userId: string, groupId: string) {
  assertUuid(groupId, "Group");
  const g = await getDb().query.group.findFirst({ where: and(eq(group.id, groupId), isNull(group.archivedAt)) });
  if (!g) throw notFound("Group not found");
  const status = g.privacy === "public" ? "active" : "pending";
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(groupMember).values({ groupId, userId, status }).onConflictDoNothing().returning();
    if (row && status === "pending") await enqueue(tx, { type: "group.join_requested", payload: { groupId, userId } });
    return { status: row?.status ?? (await tx.query.groupMember.findFirst({ where: and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)) }))?.status };
  });
}

/** Leave a group. The last moderator of a community can't leave it without a successor. */
export async function leaveGroup(userId: string, groupId: string) {
  assertUuid(groupId, "Group");
  const g = await getDb().query.group.findFirst({ where: eq(group.id, groupId) });
  if (!g) throw notFound("Group not found");
  if (g.kind === "community" && (await isModerator(userId, groupId))) {
    const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(groupMember).where(and(eq(groupMember.groupId, groupId), eq(groupMember.role, "moderator"), eq(groupMember.status, "active")));
    if (n <= 1) throw badRequest("Make someone else a moderator before you leave");
  }
  await getDb().delete(groupMember).where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
}

export const moderateInput = z.object({ action: z.enum(["approve", "decline", "remove", "make_moderator"]) });

export async function moderateMember(moderatorId: string, groupId: string, memberId: string, input: z.input<typeof moderateInput>) {
  const { action } = moderateInput.parse(input);
  assertUuid(groupId, "Group");
  assertUuid(memberId, "Member");
  if (!(await isModerator(moderatorId, groupId))) throw forbidden("Only moderators can do that");
  if (memberId === moderatorId) throw badRequest("You can't do that to yourself");
  const m = await getDb().query.groupMember.findFirst({ where: and(eq(groupMember.groupId, groupId), eq(groupMember.userId, memberId)) });
  if (!m) throw notFound("Member not found");
  const where = and(eq(groupMember.groupId, groupId), eq(groupMember.userId, memberId));
  if (action === "approve") {
    if (m.status !== "pending") throw badRequest("No request to approve");
    await getDb().update(groupMember).set({ status: "active" }).where(where);
  } else if (action === "make_moderator") {
    if (m.status !== "active") throw badRequest("Approve them first");
    await getDb().update(groupMember).set({ role: "moderator" }).where(where);
  } else {
    if (m.role === "moderator" && action === "remove") throw forbidden("Moderators can't remove other moderators");
    await getDb().delete(groupMember).where(where);
  }
}

/** The six spaces (opt-in groups shown on the home page and in onboarding). */
export async function listSpaces() {
  return getDb().select({ group, members: memberCount }).from(group).where(eq(group.kind, "space")).orderBy(asc(group.name));
}

// ---------- Referrals between professionals ----------

export const referralInput = z.object({
  toUserId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  clientLabel: z.string().trim().min(3, "Describe who you're referring in a few words").max(120),
  note: z.string().trim().min(10, "Add a short note").max(600),
});

async function isProfessional(userId: string) {
  return Boolean(await getDb().query.professionalProfile.findFirst({ where: eq(professionalProfile.userId, userId) }));
}

/**
 * Refer work to another professional you're connected with. Minimum
 * information only: a short description of the client and a note, never
 * names, contact details or health information.
 */
export async function createReferral(fromUserId: string, input: z.input<typeof referralInput>) {
  const d = referralInput.parse(input);
  if (d.toUserId === fromUserId) throw badRequest("You can't refer to yourself");
  if (!(await isProfessional(fromUserId))) throw forbidden("Referrals are for professionals");
  if (!(await isProfessional(d.toUserId))) throw badRequest("You can only refer to a professional");
  if (!(await areConnected(fromUserId, d.toUserId)) || (await isBlockedEitherWay(fromUserId, d.toUserId))) throw forbidden("Connect with them first");
  if (/\b\d{10}\b|@[a-z0-9-]+\./i.test(`${d.clientLabel} ${d.note}`)) throw badRequest("Leave out phone numbers and email addresses; share contact details directly once they accept");
  return getDb().transaction(async (tx) => {
    const [r] = await tx.insert(referral).values({ fromUserId, ...d }).returning();
    await tx.insert(referralEvent).values({ referralId: r.id, actorId: fromUserId, status: "pending", note: "" });
    await enqueue(tx, { type: "referral.updated", payload: { referralId: r.id, toUserId: d.toUserId, status: "pending" } });
    return r;
  });
}

export const referralUpdateInput = z.object({
  status: z.enum(["accepted", "declined", "completed", "withdrawn"]),
  note: z.string().trim().max(300).default(""),
});

/**
 * The receiver accepts, declines or completes; the sender can withdraw while
 * it's pending. Every change is added to the trail.
 */
export async function updateReferral(userId: string, referralId: string, input: z.input<typeof referralUpdateInput>) {
  const d = referralUpdateInput.parse(input);
  assertUuid(referralId, "Referral");
  return getDb().transaction(async (tx) => {
    const [r] = await tx.select().from(referral).where(eq(referral.id, referralId)).for("update");
    if (!r || (r.fromUserId !== userId && r.toUserId !== userId)) throw notFound("Referral not found");
    const allowed: Record<string, { by: "to" | "from"; from: string[] }> = {
      accepted: { by: "to", from: ["pending"] },
      declined: { by: "to", from: ["pending"] },
      completed: { by: "to", from: ["accepted"] },
      withdrawn: { by: "from", from: ["pending", "accepted"] },
    };
    const rule = allowed[d.status];
    if ((rule.by === "to" ? r.toUserId : r.fromUserId) !== userId) throw forbidden();
    if (!rule.from.includes(r.status)) throw badRequest(`This referral is ${r.status}`);
    const [row] = await tx.update(referral).set({ status: d.status, updatedAt: new Date() }).where(eq(referral.id, r.id)).returning();
    await tx.insert(referralEvent).values({ referralId: r.id, actorId: userId, status: d.status, note: d.note });
    const notify = userId === r.toUserId ? r.fromUserId : r.toUserId;
    await enqueue(tx, { type: "referral.updated", payload: { referralId: r.id, toUserId: notify, status: d.status } });
    return row;
  });
}

export async function listReferrals(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      referral,
      categoryName: category.name,
      fromName: sql<string>`(select u.name from ${user} u where u.id = ${referral.fromUserId})`,
      toName: sql<string>`(select u.name from ${user} u where u.id = ${referral.toUserId})`,
    })
    .from(referral)
    .leftJoin(category, eq(category.id, referral.categoryId))
    .where(or(eq(referral.fromUserId, userId), eq(referral.toUserId, userId)))
    .orderBy(desc(referral.updatedAt));
  const ids = rows.map((r) => r.referral.id);
  const events = ids.length
    ? await db
        .select({ referralId: referralEvent.referralId, status: referralEvent.status, note: referralEvent.note, createdAt: referralEvent.createdAt, actorName: user.name })
        .from(referralEvent)
        .innerJoin(user, eq(user.id, referralEvent.actorId))
        .where(inArray(referralEvent.referralId, ids))
        .orderBy(asc(referralEvent.createdAt))
    : [];
  return rows.map((r) => ({ ...r, incoming: r.referral.toUserId === userId, trail: events.filter((e) => e.referralId === r.referral.id) }));
}

/** Connected professionals you can refer to. */
export async function referralTargets(userId: string) {
  const ids = await connectionIds(userId);
  if (!ids.length) return [];
  return getDb()
    .select({ id: user.id, name: user.name, headline: professionalProfile.headline })
    .from(professionalProfile)
    .innerJoin(user, eq(user.id, professionalProfile.userId))
    .where(and(inArray(user.id, ids), activeUser))
    .orderBy(asc(user.name));
}

/** Count of things waiting for you in Connect, for the nav. */
export async function connectBadges(userId: string) {
  const [invites, unread, refs] = [
    (await listInvitations(userId)).length,
    await unreadMessageCount(userId),
    (await getDb().select({ n: sql<number>`count(*)::int` }).from(referral).where(and(eq(referral.toUserId, userId), eq(referral.status, "pending"))))[0].n,
  ];
  return { invites, unread, referrals: refs };
}


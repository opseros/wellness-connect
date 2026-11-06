// Connect: the free professional network open to every account.
import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex, primaryKey, check } from "drizzle-orm/pg-core";
import { category } from "./professionals";
import { sql } from "drizzle-orm";
import { user } from "./auth";

export const memberProfile = pgTable("member_profile", {
  userId: uuid("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  headline: text("headline").notNull().default(""),
  city: text("city").notNull().default(""),
  jobTitle: text("job_title").notNull().default(""),
  company: text("company").notNull().default(""),
  topics: text("topics").array().notNull().default([]),
  visibility: text("visibility", { enum: ["members", "connections"] }).notNull().default("members"),
  messagesFromConnectionsOnly: boolean("messages_from_connections_only").notNull().default(true),
  // A line about yourself and what you're open to (buddy, mentoring, group sessions, referrals).
  intro: text("intro").notNull().default(""),
  openTo: text("open_to").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per pair of users. userLow < userHigh keeps the pair unique
// whichever side sent the request.
export const connection = pgTable(
  "connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLow: uuid("user_low").notNull().references(() => user.id, { onDelete: "cascade" }),
    userHigh: uuid("user_high").notNull().references(() => user.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").notNull().references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "declined"] }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("connection_pair_uq").on(t.userLow, t.userHigh),
    index("connection_high_idx").on(t.userHigh),
    check("connection_order_chk", sql`${t.userLow} < ${t.userHigh}`),
  ],
);

export const block = pgTable(
  "block",
  {
    blockerId: uuid("blocker_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/** People you follow see in your feed without connecting (one way). */
export const follow = pgTable(
  "follow",
  {
    followerId: uuid("follower_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index("follow_followee_idx").on(t.followeeId)],
);

export const SPACE_KEYS = ["wellness", "travel", "meetup", "move", "food", "career"] as const;

/**
 * Groups. The six home-page spaces are groups with kind "space" (seeded, no
 * creator, open to all); members start "community" groups themselves.
 * "circle" groups are made and joined automatically: one per city (public)
 * and one per company (members of that company only). `circleKey` is
 * "city:<name>" or "org:<orgId>".
 */
export const group = pgTable("group", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  about: text("about").notNull().default(""),
  privacy: text("privacy", { enum: ["public", "approval"] }).notNull().default("public"),
  kind: text("kind", { enum: ["space", "community", "circle"] }).notNull().default("community"),
  circleKey: text("circle_key").unique(),
  spaceKey: text("space_key", { enum: SPACE_KEYS }),
  city: text("city").notNull().default(""),
  createdBy: uuid("created_by").references(() => user.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMember = pgTable(
  "group_member",
  {
    groupId: uuid("group_id").notNull().references(() => group.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["member", "moderator"] }).notNull().default("member"),
    status: text("status", { enum: ["active", "pending"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("group_member_user_idx").on(t.userId)],
);

export const post = pgTable(
  "post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => group.id, { onDelete: "cascade" }),
    title: text("title"),
    body: text("body").notNull(),
    // A meet-up is a post with a time and a place; people say "I'm going".
    kind: text("kind", { enum: ["post", "meetup"] }).notNull().default("post"),
    eventAt: timestamp("event_at", { withTimezone: true }),
    eventPlace: text("event_place"),
    eventCity: text("event_city"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Set when enough people report it; hidden until staff review.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (t) => [
    index("post_author_idx").on(t.authorId),
    index("post_group_idx").on(t.groupId),
    index("post_created_idx").on(t.createdAt),
    index("post_event_idx").on(t.eventAt),
  ],
);

/** "I'm here": a check-in at a meet-up, from shortly before it starts until a few hours after. */
export const meetupCheckin = pgTable(
  "meetup_checkin",
  {
    postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("meetup_checkin_user_idx").on(t.userId)],
);

export const meetupRsvp = pgTable(
  "meetup_rsvp",
  {
    postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const postReaction = pgTable(
  "post_reaction",
  {
    postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const comment = pgTable(
  "comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (t) => [index("comment_post_idx").on(t.postId)],
);

export const conversation = pgTable("conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("participant_user_idx").on(t.userId)],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("message_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const REFERRAL_STATUSES = ["pending", "accepted", "declined", "completed", "withdrawn"] as const;

export const referral = pgTable(
  "referral",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => category.id),
    // Who is being referred, in the fewest words: e.g. "HR team at a 200-person company". Never names or health details.
    clientLabel: text("client_label").notNull().default(""),
    // Minimum necessary information only. Never client health details.
    note: text("note").notNull(),
    status: text("status", { enum: REFERRAL_STATUSES }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("referral_to_idx").on(t.toUserId), index("referral_from_idx").on(t.fromUserId)],
);

/** Every status change on a referral, so both sides see the trail. */
export const referralEvent = pgTable(
  "referral_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id").notNull().references(() => referral.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: REFERRAL_STATUSES }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("referral_event_idx").on(t.referralId)],
);

export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  targetType: text("target_type", { enum: ["post", "comment", "message", "user", "group"] }).notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "actioned", "dismissed"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Buddy match ----------

export const BUDDY_ACTIVITIES = ["walk", "run", "gym", "yoga", "meditation", "cycling", "sports", "swim"] as const;
export const BUDDY_TIMES = ["early", "lunch", "evening", "weekend"] as const;
export const BUDDY_PACES = ["easy", "steady", "push"] as const;

/** "Find me a buddy": one open request per activity. No contact details, ever. */
export const buddyRequest = pgTable(
  "buddy_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    activity: text("activity", { enum: BUDDY_ACTIVITIES }).notNull(),
    city: text("city").notNull(),
    times: text("times").array().notNull(),
    pace: text("pace", { enum: BUDDY_PACES }).notNull().default("steady"),
    note: text("note").notNull().default(""),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("buddy_request_match_idx").on(t.activity, t.status),
    uniqueIndex("buddy_request_open_uq").on(t.userId, t.activity).where(sql`${t.status} = 'open'`),
  ],
);

/**
 * A suggested pair. Each side answers yes or no; only when both say yes are
 * they connected (and can message). Neither sees the other's answer.
 */
export const buddyMatch = pgTable(
  "buddy_match",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLow: uuid("user_low").notNull().references(() => user.id, { onDelete: "cascade" }),
    userHigh: uuid("user_high").notNull().references(() => user.id, { onDelete: "cascade" }),
    activity: text("activity", { enum: BUDDY_ACTIVITIES }).notNull(),
    lowAnswer: text("low_answer", { enum: ["yes", "no"] }),
    highAnswer: text("high_answer", { enum: ["yes", "no"] }),
    status: text("status", { enum: ["proposed", "matched", "passed"] }).notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("buddy_match_pair_uq").on(t.userLow, t.userHigh, t.activity),
    index("buddy_match_high_idx").on(t.userHigh),
    check("buddy_match_order_chk", sql`${t.userLow} < ${t.userHigh}`),
  ],
);

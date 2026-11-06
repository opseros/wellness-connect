// Connect, social layer: circles (made and joined automatically) and buddy match.
// Part of the connect module; same rules as service.ts (no RLS on these tables,
// so every function checks blocks, standing and ownership itself).
import { and, desc, eq, inArray, isNull, like, ne, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { BUDDY_ACTIVITIES, BUDDY_PACES, BUDDY_TIMES, buddyMatch, buddyRequest, connection, group, groupMember, memberProfile, post, user } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { assertUuid, badRequest, notFound } from "@/lib/errors";
import { enqueue } from "@/modules/platform/outbox";
import { listMemberships } from "@/modules/organizations/service";
import { CONTACT_DETAILS, blockedIds, cityKey, getMemberProfile, isBlockedEitherWay, profileInput, updateMemberProfile } from "./service";

const activeUser = and(isNull(user.deletedAt), isNull(user.suspendedAt));

// ---------- Circles ----------

export { cityKey };

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

async function ensureCircle(db: Executor, key: string, name: string, about: string, privacy: "public" | "approval", city: string) {
  const slug = `circle-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.slice(0, 64);
  await db.insert(group).values({ slug, name, about, privacy, kind: "circle", circleKey: key, city }).onConflictDoNothing();
  const g = await db.query.group.findFirst({ where: eq(group.circleKey, key) });
  if (!g) throw new Error(`Circle ${key} missing`);
  return g;
}

/**
 * Keeps a member's circles in step with their profile and workplaces:
 * - one public circle for their city (joined when `joinCity`, i.e. on profile save,
 *   so leaving it sticks until they change city);
 * - one private circle per company they're an active member of (organisation
 *   live). Leaving the company takes them out of its circle.
 */
export async function syncCircles(userId: string, opts: { joinCity: boolean } = { joinCity: false }, db: Executor = getDb()) {
  const orgs = (await listMemberships(userId, db)).filter(
    (m) => m.membership.status === "active" && m.organization.kind === "company" && !m.organization.suspendedAt && !m.organization.removedAt,
  );
  const wantedOrg = new Set(orgs.map((m) => `org:${m.organization.id}`));
  const current = await db
    .select({ groupId: group.id, key: group.circleKey })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(and(eq(groupMember.userId, userId), eq(group.kind, "circle")));

  const leave = current.filter((c) => c.key?.startsWith("org:") && !wantedOrg.has(c.key)).map((c) => c.groupId);
  for (const m of orgs) {
    const key = `org:${m.organization.id}`;
    if (current.some((c) => c.key === key)) continue;
    const g = await ensureCircle(db, key, `${m.organization.name} circle`, `Everyone at ${m.organization.name} on Connect. Only people who work here can see it.`, "approval", "");
    await db.insert(groupMember).values({ groupId: g.id, userId, status: "active" }).onConflictDoNothing();
  }

  if (opts.joinCity) {
    const profile = await db.query.memberProfile.findFirst({ where: eq(memberProfile.userId, userId) });
    const k = cityKey(profile?.city ?? "");
    const key = k ? `city:${k}` : null;
    leave.push(...current.filter((c) => c.key?.startsWith("city:") && c.key !== key).map((c) => c.groupId));
    if (key && !current.some((c) => c.key === key)) {
      const name = titleCase(k);
      const g = await ensureCircle(db, key, `${name} circle`, `Members in ${name}: plans, meet-ups and local tips.`, "public", name);
      await db.insert(groupMember).values({ groupId: g.id, userId, status: "active" }).onConflictDoNothing();
    }
  }
  if (leave.length) await db.delete(groupMember).where(and(eq(groupMember.userId, userId), inArray(groupMember.groupId, leave)));
}

/** Your circles with member counts and posts this week, city first. */
export async function myCircles(userId: string) {
  return getDb()
    .select({
      id: group.id,
      slug: group.slug,
      name: group.name,
      company: sql<boolean>`${group.circleKey} like 'org:%'`,
      members: sql<number>`(select count(*)::int from ${groupMember} gm where gm.group_id = ${group.id} and gm.status = 'active')`,
      postsThisWeek: sql<number>`(select count(*)::int from ${post} p where p.group_id = ${group.id} and p.deleted_at is null and p.hidden_at is null and p.created_at > now() - interval '7 days')`,
    })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(and(eq(groupMember.userId, userId), eq(groupMember.status, "active"), eq(group.kind, "circle"), isNull(group.archivedAt)))
    .orderBy(sql`${group.circleKey} like 'org:%'`, group.name);
}

/** Other cities' circles, biggest first (to join when you travel or move). */
export async function cityCircles(limit = 12) {
  const members = sql<number>`(select count(*)::int from ${groupMember} gm where gm.group_id = ${group.id} and gm.status = 'active')`;
  return getDb()
    .select({ id: group.id, slug: group.slug, name: group.name, members })
    .from(group)
    .where(and(eq(group.kind, "circle"), like(group.circleKey, "city:%"), isNull(group.archivedAt)))
    .orderBy(desc(members), group.name)
    .limit(limit);
}

/** Save your Connect profile, then move you into the circle for your (new) city. */
export async function saveProfileAndCircles(userId: string, input: z.input<typeof profileInput>) {
  const row = await updateMemberProfile(userId, input);
  await syncCircles(userId, { joinCity: input.city !== undefined });
  return row;
}

// ---------- Buddy match ----------

export const BUDDY_ACTIVITY_LABEL: Record<(typeof BUDDY_ACTIVITIES)[number], string> = {
  walk: "Walking",
  run: "Running",
  gym: "Gym",
  yoga: "Yoga",
  meditation: "Meditation",
  cycling: "Cycling",
  sports: "Sports",
  swim: "Swimming",
};
export const BUDDY_TIME_LABEL: Record<(typeof BUDDY_TIMES)[number], string> = {
  early: "Early morning",
  lunch: "Lunch break",
  evening: "After work",
  weekend: "Weekends",
};
export const BUDDY_PACE_LABEL: Record<(typeof BUDDY_PACES)[number], string> = {
  easy: "Easy going",
  steady: "Steady",
  push: "Push me",
};

/** At most this many open requests per member, and suggestions per new request. */
export const MAX_OPEN_BUDDY_REQUESTS = 4;
const SUGGESTIONS_PER_REQUEST = 3;

export const buddyInput = z.object({
  activity: z.enum(BUDDY_ACTIVITIES),
  city: z.string().trim().min(2, "Which city?").max(80),
  times: z.array(z.enum(BUDDY_TIMES)).min(1, "Pick at least one time").max(BUDDY_TIMES.length),
  pace: z.enum(BUDDY_PACES).default("steady"),
  note: z
    .string()
    .trim()
    .max(200)
    .default("")
    .refine((v) => !CONTACT_DETAILS.test(v), "Please don't add phone numbers or email addresses; you can message once you've both said yes"),
});

const pairOf = (a: string, b: string) => (a < b ? { userLow: a, userHigh: b } : { userLow: b, userHigh: a });

/**
 * Open (or update) a buddy request for one activity, then suggest up to three
 * people with an open request for the same activity in the same city at an
 * overlapping time. Never suggests someone blocked either way, someone you're
 * already connected to, or a pair suggested before for that activity.
 */
export async function requestBuddy(userId: string, input: z.input<typeof buddyInput>) {
  const d = buddyInput.parse(input);
  const city = cityKey(d.city);
  return getDb().transaction(async (tx) => {
    const open = await tx.select({ id: buddyRequest.id, activity: buddyRequest.activity }).from(buddyRequest).where(and(eq(buddyRequest.userId, userId), eq(buddyRequest.status, "open")));
    const same = open.find((r) => r.activity === d.activity);
    if (!same && open.length >= MAX_OPEN_BUDDY_REQUESTS) throw badRequest(`You can look for buddies for up to ${MAX_OPEN_BUDDY_REQUESTS} activities at once; close one first`);
    const values = { city, times: d.times, pace: d.pace, note: d.note };
    const [request] = same
      ? await tx.update(buddyRequest).set(values).where(eq(buddyRequest.id, same.id)).returning()
      : await tx.insert(buddyRequest).values({ userId, activity: d.activity, ...values }).returning();

    const blocked = await blockedIds(userId, tx);
    const others = await tx
      .select({ userId: buddyRequest.userId, pace: buddyRequest.pace })
      .from(buddyRequest)
      .innerJoin(user, eq(user.id, buddyRequest.userId))
      .where(
        and(
          eq(buddyRequest.status, "open"),
          eq(buddyRequest.activity, d.activity),
          eq(buddyRequest.city, city),
          ne(buddyRequest.userId, userId),
          sql`${buddyRequest.times} && array[${sql.join(d.times.map((t) => sql`${t}`), sql`, `)}]::text[]`,
          activeUser,
          blocked.length ? notInArray(buddyRequest.userId, blocked) : undefined,
          sql`not exists(select 1 from ${connection} c where c.status = 'accepted' and ((c.user_low = ${userId} and c.user_high = ${buddyRequest.userId}) or (c.user_high = ${userId} and c.user_low = ${buddyRequest.userId})))`,
          sql`not exists(select 1 from ${buddyMatch} m where m.activity = ${d.activity} and ((m.user_low = ${userId} and m.user_high = ${buddyRequest.userId}) or (m.user_high = ${userId} and m.user_low = ${buddyRequest.userId})))`,
        ),
      )
      .orderBy(sql`${buddyRequest.pace} = ${d.pace} desc`, desc(buddyRequest.createdAt))
      .limit(SUGGESTIONS_PER_REQUEST);
    const created: string[] = [];
    for (const o of others) {
      const [m] = await tx.insert(buddyMatch).values({ ...pairOf(userId, o.userId), activity: d.activity }).onConflictDoNothing().returning();
      if (m) {
        created.push(m.id);
        await enqueue(tx, { type: "buddy.suggested", payload: { matchId: m.id, userIds: [m.userLow, m.userHigh] } });
      }
    }
    return { request, suggested: created.length };
  });
}

export async function closeBuddyRequest(userId: string, requestId: string) {
  assertUuid(requestId, "Request");
  const [row] = await getDb()
    .update(buddyRequest)
    .set({ status: "closed", closedAt: new Date() })
    .where(and(eq(buddyRequest.id, requestId), eq(buddyRequest.userId, userId), eq(buddyRequest.status, "open")))
    .returning();
  if (!row) throw notFound("Request not found");
  return row;
}

/**
 * Your open requests and your suggestions. For a suggestion you see the other
 * person's first name, headline, the times you share and their note; never
 * their answer, and never more than their public profile shows.
 */
export async function buddyOverview(userId: string) {
  const db = getDb();
  const requests = await db.select().from(buddyRequest).where(and(eq(buddyRequest.userId, userId), eq(buddyRequest.status, "open"))).orderBy(desc(buddyRequest.createdAt));
  const blocked = await blockedIds(userId);
  const rows = await db
    .select({ m: buddyMatch })
    .from(buddyMatch)
    .where(and(or(eq(buddyMatch.userLow, userId), eq(buddyMatch.userHigh, userId)), ne(buddyMatch.status, "passed")))
    .orderBy(desc(buddyMatch.createdAt))
    .limit(60);
  const otherIds = rows.map(({ m }) => (m.userLow === userId ? m.userHigh : m.userLow)).filter((id) => !blocked.includes(id));
  const people = otherIds.length
    ? await db
        .select({ id: user.id, name: user.name, headline: memberProfile.headline })
        .from(user)
        .leftJoin(memberProfile, eq(memberProfile.userId, user.id))
        .where(and(inArray(user.id, otherIds), activeUser))
    : [];
  const theirRequests = otherIds.length
    ? await db.select().from(buddyRequest).where(and(inArray(buddyRequest.userId, otherIds), eq(buddyRequest.status, "open")))
    : [];
  const mineBy = new Map(requests.map((r) => [r.activity, r]));
  const matches = rows.flatMap(({ m }) => {
    const low = m.userLow === userId;
    const otherId = low ? m.userHigh : m.userLow;
    const person = people.find((p) => p.id === otherId);
    if (!person) return [];
    const theirs = theirRequests.find((r) => r.userId === otherId && r.activity === m.activity);
    const mine = mineBy.get(m.activity);
    const myAnswer = low ? m.lowAnswer : m.highAnswer;
    return [
      {
        id: m.id,
        activity: m.activity,
        status: m.status,
        myAnswer,
        waiting: m.status === "proposed" && myAnswer === "yes",
        otherId: m.status === "matched" ? otherId : null,
        firstName: person.name.split(/\s+/)[0],
        headline: person.headline ?? "",
        pace: theirs?.pace ?? null,
        note: theirs?.note ?? "",
        sharedTimes: theirs && mine ? theirs.times.filter((t) => mine.times.includes(t)) : (theirs?.times ?? []),
        createdAt: m.createdAt,
      },
    ];
  });
  return { requests, matches };
}

export const buddyAnswerInput = z.object({ answer: z.enum(["yes", "no"]) });

/**
 * Say yes or no to a suggestion. Any "no" ends it quietly. Two yeses connect
 * you (so you can message and plan), and both of you are told.
 */
export async function answerBuddyMatch(userId: string, matchId: string, input: z.input<typeof buddyAnswerInput>) {
  assertUuid(matchId, "Match");
  const { answer } = buddyAnswerInput.parse(input);
  return getDb().transaction(async (tx) => {
    const m = await tx.query.buddyMatch.findFirst({ where: eq(buddyMatch.id, matchId) });
    if (!m || (m.userLow !== userId && m.userHigh !== userId)) throw notFound("Suggestion not found");
    if (m.status !== "proposed") throw badRequest("This suggestion has already been settled");
    const otherId = m.userLow === userId ? m.userHigh : m.userLow;
    if (await isBlockedEitherWay(userId, otherId, tx)) throw notFound("Suggestion not found");
    const low = m.userLow === userId;
    const mine = low ? { lowAnswer: answer } : { highAnswer: answer };
    const theirs = low ? m.highAnswer : m.lowAnswer;
    const status = answer === "no" || theirs === "no" ? "passed" : theirs === "yes" ? "matched" : "proposed";
    const [row] = await tx.update(buddyMatch).set({ ...mine, status }).where(eq(buddyMatch.id, m.id)).returning();
    if (status === "matched") {
      const p = pairOf(userId, otherId);
      await tx
        .insert(connection)
        .values({ ...p, requestedBy: otherId, status: "accepted", respondedAt: new Date() })
        .onConflictDoUpdate({ target: [connection.userLow, connection.userHigh], set: { status: "accepted", respondedAt: new Date() } });
      await enqueue(tx, { type: "buddy.matched", payload: { matchId: m.id, userIds: [m.userLow, m.userHigh] } });
    }
    return { status: row.status };
  });
}

/** Count of suggestions waiting for your answer (for the nav badge). */
export async function pendingBuddyCount(userId: string) {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(buddyMatch)
    .where(
      and(
        eq(buddyMatch.status, "proposed"),
        or(and(eq(buddyMatch.userLow, userId), isNull(buddyMatch.lowAnswer)), and(eq(buddyMatch.userHigh, userId), isNull(buddyMatch.highAnswer))),
      ),
    );
  return n;
}

/** Default city for the buddy form: your profile city. */
export async function buddyDefaults(userId: string) {
  const p = await getMemberProfile(userId);
  return { city: p?.city ?? "", openToBuddy: Boolean(p?.openTo.includes("buddy")) };
}

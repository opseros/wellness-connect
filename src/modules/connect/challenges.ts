// Connect, challenges: time-boxed group goals. Part of the connect module (no
// RLS on these tables; every function checks who may see or change what).
//
// Privacy: a member only ever sees their own numbers. Everything else is a
// total across participants, and totals are only shown once at least
// MIN_GROUP people have joined, so a small group can't reveal one person.
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { CHALLENGE_UNITS, challenge, challengeLog, challengeParticipant } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { assertUuid, badRequest, forbidden, notFound } from "@/lib/errors";
import { ORG_BUYERS, assertCompanyOrg, listMemberships, requireOrgRole } from "@/modules/organizations/service";

export type ChallengeUnit = (typeof CHALLENGE_UNITS)[number];

export const MIN_GROUP = 3;
/** How many days back you can still log (today, yesterday, the day before). */
export const LOG_DAYS_BACK = 2;
export const MAX_CHALLENGE_DAYS = 42;

export const UNIT_LABEL: Record<ChallengeUnit, { one: string; many: string; verb: string }> = {
  steps: { one: "step", many: "steps", verb: "Steps today" },
  minutes: { one: "minute", many: "minutes", verb: "Minutes today" },
  km: { one: "km", many: "km", verb: "Kilometres today" },
  days: { one: "day", many: "days", verb: "Done today" },
};
const DEFAULT_DAILY_MAX: Record<ChallengeUnit, number> = { steps: 60000, minutes: 600, km: 100, days: 1 };

const tz = "Asia/Kolkata";
/** Today's date in India, "YYYY-MM-DD". */
export function istToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const challengeInput = z
  .object({
    title: z.string().trim().min(3, "Give the challenge a title").max(80),
    about: z.string().trim().max(600).default(""),
    unit: z.enum(CHALLENGE_UNITS),
    goal: z.coerce.number().int().min(1, "Set a goal").max(10_000_000),
    dailyMax: z.coerce.number().int().min(1).max(1_000_000).optional(),
    startsOn: isoDay,
    endsOn: isoDay,
  })
  .refine((d) => d.endsOn >= d.startsOn, { message: "The end date must be on or after the start", path: ["endsOn"] })
  .refine((d) => daysBetween(d.startsOn, d.endsOn) < MAX_CHALLENGE_DAYS, { message: `Keep it to ${MAX_CHALLENGE_DAYS} days or fewer`, path: ["endsOn"] })
  .refine((d) => d.unit !== "days" || d.goal <= daysBetween(d.startsOn, d.endsOn) + 1, { message: "The goal can't be more days than the challenge lasts", path: ["goal"] });

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "challenge";

async function insertChallenge(db: Executor, createdBy: string, orgId: string | null, input: z.input<typeof challengeInput>) {
  const d = challengeInput.parse(input);
  if (d.endsOn < istToday()) throw badRequest("That challenge would already be over");
  const dailyMax = d.unit === "days" ? 1 : (d.dailyMax ?? DEFAULT_DAILY_MAX[d.unit]);
  const [row] = await db
    .insert(challenge)
    .values({ ...d, dailyMax, orgId, createdBy, slug: `${slugify(d.title)}-${crypto.randomUUID().slice(0, 6)}` })
    .returning();
  return row;
}

/** A challenge for every member. Only the admin service calls this, after its staff check and audit. */
export async function createPlatformChallenge(staffId: string, input: z.input<typeof challengeInput>, db: Executor = getDb()) {
  return insertChallenge(db, staffId, null, input);
}

/** A challenge for one company's members, set up by its owners, admins or wellness managers. */
export async function createCompanyChallenge(userId: string, orgId: string, input: z.input<typeof challengeInput>) {
  return getDb().transaction(async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    await assertCompanyOrg(orgId, tx);
    return insertChallenge(tx, userId, orgId, input);
  });
}

/** Company buyers can end their own company's challenges early (hidden from members). */
export async function archiveCompanyChallenge(userId: string, orgId: string, challengeId: string) {
  assertUuid(challengeId, "Challenge");
  await requireOrgRole(userId, orgId, ORG_BUYERS);
  const [row] = await getDb()
    .update(challenge)
    .set({ archivedAt: new Date() })
    .where(and(eq(challenge.id, challengeId), eq(challenge.orgId, orgId), isNull(challenge.archivedAt)))
    .returning();
  if (!row) throw notFound("Challenge not found");
  return row;
}

/** Staff only (the admin service checks and audits). */
export async function archiveChallengeById(challengeId: string, db: Executor = getDb()) {
  assertUuid(challengeId, "Challenge");
  const [row] = await db.update(challenge).set({ archivedAt: new Date() }).where(and(eq(challenge.id, challengeId), isNull(challenge.archivedAt))).returning();
  if (!row) throw notFound("Challenge not found");
  return row;
}

/** Companies this person is an active member of (and that are live). */
async function myCompanyIds(userId: string, db?: Executor) {
  return (await listMemberships(userId, db))
    .filter((m) => m.membership.status === "active" && m.organization.kind === "company" && !m.organization.suspendedAt && !m.organization.removedAt)
    .map((m) => m.organization.id);
}

const participants = sql<number>`(select count(*)::int from ${challengeParticipant} cp where cp.challenge_id = ${challenge.id})`;
const finishers = sql<number>`(select count(*)::int from ${challengeParticipant} cp where cp.challenge_id = ${challenge.id} and cp.completed_at is not null)`;
const together = sql<number>`(select coalesce(sum(cp.total), 0)::bigint::float8 from ${challengeParticipant} cp where cp.challenge_id = ${challenge.id})`;

type Row = typeof challenge.$inferSelect & { participants: number; finishers: number; together: number };

/** What a member may see about a challenge: totals only when the group is big enough. */
function shape(r: Row, mine: { total: number; completedAt: Date | null } | undefined, today: string) {
  const group = r.participants >= MIN_GROUP;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    about: r.about,
    unit: r.unit,
    goal: r.goal,
    dailyMax: r.dailyMax,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    company: Boolean(r.orgId),
    state: (today < r.startsOn ? "upcoming" : today > r.endsOn ? "ended" : "live") as "upcoming" | "live" | "ended",
    daysLeft: Math.max(0, daysBetween(today, r.endsOn) + 1),
    participants: r.participants,
    finishers: group ? r.finishers : null,
    together: group ? r.together : null,
    joined: Boolean(mine),
    myTotal: mine?.total ?? 0,
    completed: Boolean(mine?.completedAt),
  };
}
export type ChallengeView = ReturnType<typeof shape>;

function visibleTo(orgIds: string[]) {
  return and(isNull(challenge.archivedAt), or(isNull(challenge.orgId), orgIds.length ? inArray(challenge.orgId, orgIds) : sql`false`));
}

/** Live and upcoming challenges you can join, plus ones that ended in the last week. Yours first. */
export async function listChallenges(userId: string, now = new Date()) {
  const today = istToday(now);
  const db = getDb();
  const orgIds = await myCompanyIds(userId);
  const rows = await db
    .select({ c: challenge, participants, finishers, together })
    .from(challenge)
    .where(and(visibleTo(orgIds), gte(challenge.endsOn, addDays(today, -7))))
    .orderBy(asc(challenge.startsOn), asc(challenge.title));
  const mine = rows.length
    ? await db.select().from(challengeParticipant).where(and(eq(challengeParticipant.userId, userId), inArray(challengeParticipant.challengeId, rows.map((r) => r.c.id))))
    : [];
  const todays = mine.length
    ? await db.select({ id: challengeLog.challengeId, amount: challengeLog.amount }).from(challengeLog).where(and(eq(challengeLog.userId, userId), eq(challengeLog.day, today), inArray(challengeLog.challengeId, mine.map((m) => m.challengeId))))
    : [];
  const views = rows.map((r) => ({
    ...shape({ ...r.c, participants: r.participants, finishers: r.finishers, together: r.together }, mine.find((m) => m.challengeId === r.c.id), today),
    myToday: todays.find((x) => x.id === r.c.id)?.amount ?? 0,
  }));
  const rank = (v: ChallengeView & { myToday: number }) => (v.state === "ended" ? 2 : v.joined ? 0 : 1);
  return views.sort((a, b) => rank(a) - rank(b));
}

async function loadVisible(userId: string, where: ReturnType<typeof eq>, db: Executor = getDb()) {
  const orgIds = await myCompanyIds(userId, db);
  const [r] = await db.select({ c: challenge, participants, finishers, together }).from(challenge).where(and(where, visibleTo(orgIds)));
  if (!r) throw notFound("Challenge not found");
  return r;
}

/** One challenge with your daily log (only yours). */
export async function getChallenge(userId: string, slug: string, now = new Date()) {
  const r = await loadVisible(userId, eq(challenge.slug, slug));
  const db = getDb();
  const today = istToday(now);
  const mine = await db.query.challengeParticipant.findFirst({ where: and(eq(challengeParticipant.challengeId, r.c.id), eq(challengeParticipant.userId, userId)) });
  const logs = mine
    ? await db.select({ day: challengeLog.day, amount: challengeLog.amount }).from(challengeLog).where(and(eq(challengeLog.challengeId, r.c.id), eq(challengeLog.userId, userId))).orderBy(asc(challengeLog.day))
    : [];
  const view = shape({ ...r.c, participants: r.participants, finishers: r.finishers, together: r.together }, mine, today);
  // Days you can still log: inside the challenge, not in the future, at most LOG_DAYS_BACK back.
  const loggable: string[] = [];
  for (let i = 0; i <= LOG_DAYS_BACK; i++) {
    const d = addDays(today, -i);
    if (d >= r.c.startsOn && d <= r.c.endsOn) loggable.push(d);
  }
  return { ...view, logs, loggable: view.joined ? loggable : [] };
}

export async function joinChallenge(userId: string, challengeId: string, now = new Date()) {
  assertUuid(challengeId, "Challenge");
  const r = await loadVisible(userId, eq(challenge.id, challengeId));
  if (istToday(now) > r.c.endsOn) throw badRequest("This challenge has ended");
  await getDb().insert(challengeParticipant).values({ challengeId, userId }).onConflictDoNothing();
  return { joined: true, slug: r.c.slug };
}

/** Leaving deletes your numbers for that challenge. */
export async function leaveChallenge(userId: string, challengeId: string) {
  assertUuid(challengeId, "Challenge");
  await getDb().transaction(async (tx) => {
    await tx.delete(challengeLog).where(and(eq(challengeLog.challengeId, challengeId), eq(challengeLog.userId, userId)));
    await tx.delete(challengeParticipant).where(and(eq(challengeParticipant.challengeId, challengeId), eq(challengeParticipant.userId, userId)));
  });
  return { joined: false };
}

export const logInput = z.object({ day: isoDay, amount: z.coerce.number().int().min(0, "Enter 0 or more") });

/**
 * Record your number for a day (again to correct it). Only for days inside the
 * challenge, not in the future and at most LOG_DAYS_BACK days ago, up to the
 * challenge's daily maximum. Reaching the goal marks you as finished.
 */
export async function logProgress(userId: string, challengeId: string, input: z.input<typeof logInput>, now = new Date()) {
  assertUuid(challengeId, "Challenge");
  const { day, amount } = logInput.parse(input);
  const today = istToday(now);
  return getDb().transaction(async (tx) => {
    const r = await loadVisible(userId, eq(challenge.id, challengeId), tx);
    const me = await tx.query.challengeParticipant.findFirst({ where: and(eq(challengeParticipant.challengeId, challengeId), eq(challengeParticipant.userId, userId)) });
    if (!me) throw forbidden("Join the challenge first");
    if (day > today) throw badRequest("You can't log a day that hasn't happened yet");
    if (day < r.c.startsOn || day > r.c.endsOn) throw badRequest("That day isn't part of this challenge");
    if (day < addDays(today, -LOG_DAYS_BACK)) throw badRequest(`You can log up to ${LOG_DAYS_BACK} days back`);
    if (amount > r.c.dailyMax) throw badRequest(`The most you can log for one day is ${r.c.dailyMax.toLocaleString("en-IN")} ${UNIT_LABEL[r.c.unit].many}`);
    await tx
      .insert(challengeLog)
      .values({ challengeId, userId, day, amount })
      .onConflictDoUpdate({ target: [challengeLog.challengeId, challengeLog.userId, challengeLog.day], set: { amount, updatedAt: new Date() } });
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${challengeLog.amount}), 0)::int` })
      .from(challengeLog)
      .where(and(eq(challengeLog.challengeId, challengeId), eq(challengeLog.userId, userId)));
    const done = total >= r.c.goal;
    const [p] = await tx
      .update(challengeParticipant)
      .set({ total, completedAt: done ? (me.completedAt ?? new Date()) : null })
      .where(and(eq(challengeParticipant.challengeId, challengeId), eq(challengeParticipant.userId, userId)))
      .returning();
    return { total: p.total, completed: Boolean(p.completedAt), justCompleted: done && !me.completedAt };
  });
}

/** Your live challenges, for the feed card. */
export async function myLiveChallenges(userId: string, now = new Date()) {
  return (await listChallenges(userId, now)).filter((c) => c.joined && c.state === "live");
}

/**
 * A company's challenges with totals only (never per person), for its buyers.
 * Numbers stay hidden until MIN_GROUP people have joined.
 */
export async function companyChallenges(userId: string, orgId: string, now = new Date()) {
  await requireOrgRole(userId, orgId, ORG_BUYERS);
  const today = istToday(now);
  const rows = await getDb()
    .select({ c: challenge, participants, finishers, together })
    .from(challenge)
    .where(and(eq(challenge.orgId, orgId), isNull(challenge.archivedAt)))
    .orderBy(desc(challenge.startsOn));
  return rows.map((r) => {
    const v = shape({ ...r.c, participants: r.participants, finishers: r.finishers, together: r.together }, undefined, today);
    return { ...v, joined: undefined, myTotal: undefined, completed: undefined };
  });
}

/** Platform challenges for the admin list (staff check happens in the admin service). */
export async function platformChallenges(db: Executor = getDb(), now = new Date()) {
  const today = istToday(now);
  const rows = await db
    .select({ c: challenge, participants, finishers, together })
    .from(challenge)
    .where(and(isNull(challenge.orgId), isNull(challenge.archivedAt)))
    .orderBy(desc(challenge.startsOn))
    .limit(100);
  return rows.map((r) => shape({ ...r.c, participants: r.participants, finishers: r.finishers, together: r.together }, undefined, today));
}


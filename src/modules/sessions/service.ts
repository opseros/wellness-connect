/**
 * Member sessions with professionals: availability, slots, requests, decisions,
 * cancellations and the lifecycle job.
 *
 * Flow: member requests a free slot (it's held) → professional accepts or declines
 * within 24 hours (never later than the start) → accepted sessions wait for payment
 * (src/modules/sessions/payments.ts) and become confirmed once paid; free sessions
 * are confirmed straight away → after the end time a confirmed session is completed.
 * Unanswered requests and unpaid acceptances expire and release the slot.
 *
 * Times: availability is in India time (minutes after midnight IST, fixed +05:30);
 * appointments store UTC instants.
 *
 * Access: `appointment` has row-level security (member or professional). Members act
 * with withScope({ userId }); professionals too (they match pro_user_id).
 * `appointment_hold` and availability carry no personal data and are read directly.
 */
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appointment, appointmentHold, proAvailability, proBookingSettings, proTimeOff, type AppointmentStatus } from "@/db/schema";
import { getDb, withScope, type Executor, type Tx } from "@/db/client";
import { assertUuid, badRequest, notFound } from "@/lib/errors";
import { enqueue } from "@/modules/platform/outbox";
import { bookableService, findOwnProfile, profileNames } from "@/modules/professionals/service";

const MIN = 60_000;
const HOUR = 60 * MIN;
const IST_OFFSET_MIN = 330;
const STEP_MIN = 30;
const RESPOND_HOURS = 24;
const PAY_HOURS = 24;

export const SESSION_STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: "Waiting for the professional",
  accepted: "Accepted, waiting for payment",
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};
export const MODE_LABEL = { online: "Online", in_person: "In person" } as const;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// ---------- India time helpers ----------

/** "YYYY-MM-DD" for an instant, in India time. */
export function istDay(d: Date) {
  return new Date(d.getTime() + IST_OFFSET_MIN * MIN).toISOString().slice(0, 10);
}
/** The UTC instant for a day ("YYYY-MM-DD") and minutes after midnight, India time. */
export function istInstant(day: string, minute: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (minute - IST_OFFSET_MIN) * MIN);
}
function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekdayOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const toMinute = (s: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

// ---------- Professional: settings, weekly hours, days off ----------

async function ownProfile(userId: string) {
  const p = await findOwnProfile(userId);
  if (!p) throw badRequest("Create your professional profile first");
  return p;
}

export async function getSchedule(userId: string) {
  const p = await ownProfile(userId);
  const db = getDb();
  const [settings, windows, off] = await Promise.all([
    db.query.proBookingSettings.findFirst({ where: eq(proBookingSettings.profileId, p.id) }),
    db.select().from(proAvailability).where(eq(proAvailability.profileId, p.id)).orderBy(asc(proAvailability.weekday), asc(proAvailability.startMinute)),
    db.select().from(proTimeOff).where(and(eq(proTimeOff.profileId, p.id), gte(proTimeOff.day, istDay(new Date())))).orderBy(asc(proTimeOff.day)),
  ]);
  return {
    profileId: p.id,
    settings: settings ?? { profileId: p.id, enabled: false, minNoticeHours: 12, maxDaysAhead: 30, bufferMinutes: 0, meetingLink: "", inPersonAddress: "", updatedAt: new Date(0) },
    windows,
    timeOff: off.map((o) => o.day),
  };
}

export const bookingSettingsInput = z.object({
  enabled: z.boolean(),
  minNoticeHours: z.coerce.number().int().min(1).max(168),
  maxDaysAhead: z.coerce.number().int().min(1).max(90),
  bufferMinutes: z.coerce.number().int().min(0).max(120),
  meetingLink: z.union([z.literal(""), z.string().trim().url("Meeting link must start with https://").max(300)]).default(""),
  inPersonAddress: z.string().trim().max(300).default(""),
});

export async function saveBookingSettings(userId: string, input: z.input<typeof bookingSettingsInput>) {
  const d = bookingSettingsInput.parse(input);
  const p = await ownProfile(userId);
  if (d.enabled && p.verificationStatus !== "verified") throw badRequest("You can take bookings once your profile is verified");
  const [row] = await getDb()
    .insert(proBookingSettings)
    .values({ profileId: p.id, ...d, updatedAt: new Date() })
    .onConflictDoUpdate({ target: proBookingSettings.profileId, set: { ...d, updatedAt: new Date() } })
    .returning();
  return row;
}

export const weeklyHoursInput = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() }))
  .max(28)
  .transform((rows, ctx) => {
    const out = rows.map((r) => ({ weekday: r.weekday, startMinute: toMinute(r.start), endMinute: toMinute(r.end) }));
    for (const r of out) {
      if (Number.isNaN(r.startMinute) || Number.isNaN(r.endMinute)) ctx.addIssue({ code: "custom", message: "Use times like 09:00" });
      else if (r.endMinute - r.startMinute < 30) ctx.addIssue({ code: "custom", message: `${WEEKDAYS[r.weekday]}: the end must be at least 30 minutes after the start` });
    }
    for (let w = 0; w < 7; w++) {
      const day = out.filter((r) => r.weekday === w).sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < day.length; i++) {
        if (day[i].startMinute < day[i - 1].endMinute) ctx.addIssue({ code: "custom", message: `${WEEKDAYS[w]}: times overlap` });
      }
    }
    return out;
  });

/** Replaces the weekly hours. Existing sessions are unaffected. */
export async function setWeeklyHours(userId: string, input: z.input<typeof weeklyHoursInput>) {
  const rows = weeklyHoursInput.parse(input);
  const p = await ownProfile(userId);
  return getDb().transaction(async (tx) => {
    await tx.delete(proAvailability).where(eq(proAvailability.profileId, p.id));
    if (rows.length) await tx.insert(proAvailability).values(rows.map((r) => ({ profileId: p.id, ...r })));
    return rows.length;
  });
}

const dayInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export async function addTimeOff(userId: string, day: string) {
  const d = dayInput.parse(day);
  if (d < istDay(new Date())) throw badRequest("Choose today or a later date");
  const p = await ownProfile(userId);
  await getDb().insert(proTimeOff).values({ profileId: p.id, day: d }).onConflictDoNothing();
}

export async function removeTimeOff(userId: string, day: string) {
  const p = await ownProfile(userId);
  await getDb().delete(proTimeOff).where(and(eq(proTimeOff.profileId, p.id), eq(proTimeOff.day, dayInput.parse(day))));
}

// ---------- Slots ----------

export type DaySlots = { day: string; slots: { startsAt: string; label: string }[] };

async function computeSlots(db: Executor, profileId: string, durationMinutes: number, fromDay: string, days: number, now = new Date()): Promise<DaySlots[]> {
  const settings = await db.query.proBookingSettings.findFirst({ where: eq(proBookingSettings.profileId, profileId) });
  if (!settings?.enabled) return [];
  const today = istDay(now);
  const lastDay = addDays(today, settings.maxDaysAhead);
  const start = fromDay < today ? today : fromDay;
  const end = [addDays(start, days - 1), lastDay].sort()[0];
  if (end < start) return [];
  const [windows, off, holds] = await Promise.all([
    db.select().from(proAvailability).where(eq(proAvailability.profileId, profileId)),
    db.select().from(proTimeOff).where(and(eq(proTimeOff.profileId, profileId), gte(proTimeOff.day, start), lte(proTimeOff.day, end))),
    db
      .select({ startsAt: appointmentHold.startsAt, endsAt: appointmentHold.endsAt })
      .from(appointmentHold)
      .where(and(eq(appointmentHold.profileId, profileId), lt(appointmentHold.startsAt, istInstant(addDays(end, 1), 0)), gt(appointmentHold.endsAt, istInstant(start, 0)))),
  ]);
  const offDays = new Set(off.map((o) => o.day));
  const earliest = now.getTime() + settings.minNoticeHours * HOUR;
  const buffer = settings.bufferMinutes * MIN;
  const out: DaySlots[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (offDays.has(day)) continue;
    const slots: DaySlots["slots"] = [];
    for (const w of windows.filter((x) => x.weekday === weekdayOf(day)).sort((a, b) => a.startMinute - b.startMinute)) {
      for (let m = w.startMinute; m + durationMinutes <= w.endMinute; m += STEP_MIN) {
        const s = istInstant(day, m).getTime();
        const e = s + durationMinutes * MIN;
        if (s < earliest) continue;
        if (holds.some((h) => s < h.endsAt.getTime() + buffer && e + buffer > h.startsAt.getTime())) continue;
        slots.push({ startsAt: new Date(s).toISOString(), label: hhmm(m) });
      }
    }
    if (slots.length) out.push({ day, slots });
  }
  return out;
}

/** Free start times for a bookable service over the next `days` days (default a week). */
export async function freeSlots(serviceId: string, fromDay = istDay(new Date()), days = 7) {
  const b = await bookableService(serviceId);
  if (!b) throw notFound("This service can't be booked");
  await sessionLifecycleJob(); // free any lapsed holds first
  return computeSlots(getDb(), b.profile.id, b.service.durationMinutes, dayInput.parse(fromDay), Math.min(Math.max(days, 1), 14));
}

/** What the booking panel on a professional's page needs. Empty when they don't take member bookings. */
export async function bookingOptions(profileId: string) {
  assertUuid(profileId, "Profile");
  const settings = await getDb().query.proBookingSettings.findFirst({ where: eq(proBookingSettings.profileId, profileId) });
  return { enabled: Boolean(settings?.enabled) };
}

// ---------- Member: request ----------

const NO_CONTACT = /(\+?\d[\d\s-]{8,}\d)|(@[a-z0-9-]+\.[a-z]{2,})/i;

export const requestInput = z.object({
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  mode: z.enum(["online", "in_person"]),
  note: z
    .string()
    .trim()
    .max(500)
    .default("")
    .refine((v) => !NO_CONTACT.test(v), "Please don't share phone numbers or email addresses; you'll get the details once it's confirmed"),
  idempotencyKey: z.string().min(8).max(100),
});

function modeAllowed(serviceModes: string[], mode: "online" | "in_person") {
  return mode === "online" ? serviceModes.some((m) => m === "virtual" || m === "hybrid") : serviceModes.some((m) => m === "in_person" || m === "hybrid");
}

/** Lock per professional so two members can't take the same slot. */
async function lockProfessional(tx: Tx, profileId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointment:${profileId}`}))`);
}

export async function requestSession(memberUserId: string, input: z.input<typeof requestInput>) {
  const d = requestInput.parse(input);
  const b = await bookableService(d.serviceId);
  if (!b) throw notFound("This service can't be booked");
  if (b.profile.userId === memberUserId) throw badRequest("You can't book your own service");
  if (!modeAllowed(b.service.deliveryModes, d.mode)) throw badRequest(d.mode === "online" ? "This service isn't offered online" : "This service isn't offered in person");
  const startsAt = new Date(d.startsAt);
  const endsAt = new Date(startsAt.getTime() + b.service.durationMinutes * MIN);
  await sessionLifecycleJob();
  return withScope({ userId: memberUserId }, async (tx) => {
    const again = await tx.query.appointment.findFirst({ where: eq(appointment.idempotencyKey, d.idempotencyKey) });
    if (again) return again;
    await lockProfessional(tx, b.profile.id);
    const free = await computeSlots(tx, b.profile.id, b.service.durationMinutes, istDay(startsAt), 1);
    if (!free.some((x) => x.slots.some((s) => s.startsAt === startsAt.toISOString()))) throw badRequest("That time is no longer free. Pick another slot.");
    const respondBy = new Date(Math.min(Date.now() + RESPOND_HOURS * HOUR, startsAt.getTime()));
    const [row] = await tx
      .insert(appointment)
      .values({
        profileId: b.profile.id,
        proUserId: b.profile.userId,
        memberUserId,
        serviceId: b.service.id,
        serviceTitle: b.service.title,
        startsAt,
        endsAt,
        mode: d.mode,
        pricePaise: b.service.memberPricePaise ?? 0,
        currency: b.service.currency,
        note: d.note,
        respondBy,
        idempotencyKey: d.idempotencyKey,
      })
      .returning();
    await tx.insert(appointmentHold).values({ appointmentId: row.id, profileId: b.profile.id, startsAt, endsAt });
    await enqueue(tx, { type: "session.requested", payload: { appointmentId: row.id } });
    return row;
  });
}

// ---------- Professional: decide ----------

export const decisionInput = z.object({ accept: z.boolean(), note: z.string().trim().max(500).default("") });

async function releaseHold(tx: Tx, appointmentId: string) {
  await tx.delete(appointmentHold).where(eq(appointmentHold.appointmentId, appointmentId));
}

export async function respondToSession(proUserId: string, appointmentId: string, input: z.input<typeof decisionInput>) {
  assertUuid(appointmentId, "Session");
  const d = decisionInput.parse(input);
  return withScope({ userId: proUserId }, async (tx) => {
    const a = await tx.query.appointment.findFirst({ where: and(eq(appointment.id, appointmentId), eq(appointment.proUserId, proUserId)) });
    if (!a) throw notFound("Session not found");
    if (a.status !== "requested") throw badRequest("This request has already been answered");
    if (a.respondBy <= new Date()) throw badRequest("This request has expired");
    const now = new Date();
    if (!d.accept) {
      const [row] = await tx.update(appointment).set({ status: "declined", decidedAt: now, proNote: d.note || null, updatedAt: now }).where(eq(appointment.id, a.id)).returning();
      await releaseHold(tx, a.id);
      await enqueue(tx, { type: "session.declined", payload: { appointmentId: a.id } });
      return row;
    }
    const free = a.pricePaise === 0;
    const payBy = free ? null : new Date(Math.min(now.getTime() + PAY_HOURS * HOUR, a.startsAt.getTime()));
    const [row] = await tx
      .update(appointment)
      .set({ status: free ? "confirmed" : "accepted", decidedAt: now, payBy, proNote: d.note || null, updatedAt: now })
      .where(eq(appointment.id, a.id))
      .returning();
    await enqueue(tx, { type: free ? "session.confirmed" : "session.accepted", payload: { appointmentId: a.id } });
    return row;
  });
}

// ---------- Either side: cancel ----------

export const cancelInput = z.object({ reason: z.string().trim().max(300).default("") });

/**
 * Member or professional cancels before the start. Paid sessions are refunded by
 * the payments module (`onSessionCancelled`); this only changes the session.
 */
export async function cancelSession(userId: string, appointmentId: string, input: z.input<typeof cancelInput> = {}) {
  assertUuid(appointmentId, "Session");
  const d = cancelInput.parse(input);
  return withScope({ userId }, async (tx) => {
    const a = await tx.query.appointment.findFirst({ where: eq(appointment.id, appointmentId) });
    if (!a || (a.memberUserId !== userId && a.proUserId !== userId)) throw notFound("Session not found");
    if (!["requested", "accepted", "confirmed"].includes(a.status)) throw badRequest("This session can't be cancelled");
    if (a.startsAt <= new Date()) throw badRequest("This session has already started");
    const byPro = a.proUserId === userId;
    const now = new Date();
    const [row] = await tx
      .update(appointment)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: userId, cancelReason: d.reason || null, updatedAt: now })
      .where(eq(appointment.id, a.id))
      .returning();
    await releaseHold(tx, a.id);
    await enqueue(tx, { type: "session.cancelled", payload: { appointmentId: a.id, byPro, wasConfirmed: a.status === "confirmed" } });
    return { appointment: row, byPro, wasConfirmed: a.status === "confirmed" };
  });
}

// ---------- Lists ----------

/** Meeting details are shared only once a session is confirmed (and with the professional always). */
async function withDetails(rows: (typeof appointment.$inferSelect)[], viewerId: string) {
  const names = await profileNames(rows.map((r) => r.profileId));
  const settings = rows.length
    ? await getDb().select().from(proBookingSettings).where(inArray(proBookingSettings.profileId, [...new Set(rows.map((r) => r.profileId))]))
    : [];
  return rows.map((r) => {
    const s = settings.find((x) => x.profileId === r.profileId);
    const reveal = r.proUserId === viewerId || r.status === "confirmed" || r.status === "completed";
    return {
      ...r,
      proName: names.get(r.profileId)?.name ?? "Professional",
      meetingLink: reveal && r.mode === "online" ? (s?.meetingLink ?? "") : "",
      address: reveal && r.mode === "in_person" ? (s?.inPersonAddress ?? "") : "",
    };
  });
}

export async function listMySessions(userId: string) {
  const rows = await withScope({ userId }, (tx) => tx.select().from(appointment).where(eq(appointment.memberUserId, userId)).orderBy(desc(appointment.startsAt)).limit(100));
  return withDetails(rows, userId);
}

export async function listProSessions(userId: string) {
  const rows = await withScope({ userId }, (tx) => tx.select().from(appointment).where(eq(appointment.proUserId, userId)).orderBy(asc(appointment.startsAt)).limit(200));
  const withNames = await withDetails(rows, userId);
  const members = rows.length
    ? await getDb().query.user.findMany({ where: (u, { inArray: inA }) => inA(u.id, [...new Set(rows.map((r) => r.memberUserId))]), columns: { id: true, name: true } })
    : [];
  return withNames.map((r) => ({ ...r, memberName: members.find((m) => m.id === r.memberUserId)?.name ?? "Member" }));
}

export async function getSession(userId: string, appointmentId: string) {
  assertUuid(appointmentId, "Session");
  const a = await withScope({ userId }, (tx) => tx.query.appointment.findFirst({ where: eq(appointment.id, appointmentId) }));
  if (!a || (a.memberUserId !== userId && a.proUserId !== userId)) throw notFound("Session not found");
  const [d] = await withDetails([a], userId);
  return d;
}

export async function proPendingSessionCount(userId: string) {
  const [r] = await withScope({ userId }, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(appointment).where(and(eq(appointment.proUserId, userId), eq(appointment.status, "requested"))),
  );
  return r?.n ?? 0;
}

// ---------- Lifecycle job (daily cron, and on demand) ----------

/** Expire unanswered requests and unpaid acceptances; complete sessions that have ended. */
export async function sessionLifecycleJob(now = new Date()) {
  return withScope({ bypass: true, userId: null }, async (tx) => {
    const lapsed = await tx
      .update(appointment)
      .set({ status: "expired", updatedAt: now })
      .where(or(and(eq(appointment.status, "requested"), lte(appointment.respondBy, now)), and(eq(appointment.status, "accepted"), lte(appointment.payBy, now))))
      .returning({ id: appointment.id });
    if (lapsed.length) {
      await tx.delete(appointmentHold).where(inArray(appointmentHold.appointmentId, lapsed.map((r) => r.id)));
      for (const r of lapsed) await enqueue(tx, { type: "session.expired", payload: { appointmentId: r.id } });
    }
    const done = await tx
      .update(appointment)
      .set({ status: "completed", updatedAt: now })
      .where(and(eq(appointment.status, "confirmed"), lte(appointment.endsAt, now)))
      .returning({ id: appointment.id });
    if (done.length) await tx.delete(appointmentHold).where(inArray(appointmentHold.appointmentId, done.map((r) => r.id)));
    return { expired: lapsed.length, completed: done.length };
  });
}

/** Used by the payments module once a session is paid. */
export async function markSessionPaid(tx: Tx, appointmentId: string) {
  const a = await tx.query.appointment.findFirst({ where: eq(appointment.id, appointmentId) });
  if (!a) throw notFound("Session not found");
  if (a.status !== "accepted") throw badRequest("This session isn't waiting for payment");
  const [row] = await tx.update(appointment).set({ status: "confirmed", updatedAt: new Date() }).where(eq(appointment.id, a.id)).returning();
  await enqueue(tx, { type: "session.confirmed", payload: { appointmentId: a.id } });
  return row;
}


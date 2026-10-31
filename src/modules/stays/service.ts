/**
 * Homestay stays (M7): calendar and nightly prices, availability, booking
 * requests, host accept/decline, guest payment, cancellations by policy.
 *
 * Flow: guest requests → host accepts within 48 hours (rooms are held) →
 * guest pays within 48 hours (or before check-in) → confirmed. Unanswered
 * requests and unpaid acceptances expire and release the rooms.
 *
 * Access: hosts act inside withScope({ userId, orgId }) with requireOrgRole;
 * guests inside withScope({ userId }). Row-level security on `stay` lets each
 * see only their own. `stay_night` (counts only) and `stay_calendar` (public
 * prices) carry no personal data, so availability can read them directly.
 * Money lives in src/modules/marketplace/stay-payments.ts.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ACCESS_NEEDS, STAY_PURPOSES, stay, stayCalendar, stayNight, user, type NightPrice } from "@/db/schema";
import { getDb, withScope, type Executor, type Tx } from "@/db/client";
import { assertUuid, badRequest, forbidden, notFound } from "@/lib/errors";
import { audit, enqueue } from "@/modules/platform/outbox";
import { getBookableHomestay, homestayNames, listDirectory, directoryInput } from "@/modules/listings/service";
import { isActiveMember, ORG_ADMINS, ORG_ALL, requireOrgRole } from "@/modules/organizations/service";
import { createStayRefund, stayMoneyForGuest, stayMoneySettings } from "@/modules/marketplace/stay-payments";
import { checkInInstant, guestCancellationRefund, isoDay, nightsOf, POLICY_TEXT, priceStay, todayIst, type CancellationPolicy } from "./policy";

const HOUR = 3_600_000;
const RESPOND_HOURS = 48;
const PAY_HOURS = 48;
const MAX_NIGHTS = 30;
const MAX_AHEAD_DAYS = 365;

export const PURPOSE_LABEL: Record<(typeof STAY_PURPOSES)[number], string> = { care: "Recovery stay", rest: "Rest", retreat: "Team retreat" };
export const ACCESS_LABEL: Record<(typeof ACCESS_NEEDS)[number], string> = {
  step_free: "Step-free access",
  ground_floor: "Ground-floor room",
  special_diet: "Special diet",
  caregiver: "Travelling with a caregiver",
};
export const STAY_STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for the host",
  accepted: "Accepted, waiting for payment",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  completed: "Completed",
};

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

// ---------- Calendar ----------

export const calendarInput = z
  .object({
    from: ymd,
    to: ymd,
    action: z.enum(["price", "clear_price", "block", "unblock"]),
    priceRupees: z.coerce.number().int().min(100).max(1_000_000).optional(),
  })
  .refine((v) => v.to >= v.from, { message: "The end date must be on or after the start date", path: ["to"] })
  .refine((v) => v.action !== "price" || v.priceRupees !== undefined, { message: "Enter the price per room per night", path: ["priceRupees"] });

/** Set prices or block dates for a range (inclusive). Owners and admins. */
export async function updateCalendar(userId: string, orgId: string, input: z.input<typeof calendarInput>) {
  const d = calendarInput.parse(input);
  await requireOrgRole(userId, orgId, ORG_ADMINS);
  const days = nightsOf(d.from, isoDay(new Date(new Date(`${d.to}T00:00:00Z`).getTime() + 86_400_000)));
  if (d.from < todayIst()) throw badRequest("Choose dates from today onwards");
  if (days.length > 366) throw badRequest("Choose up to a year at a time");
  const db = getDb();
  if (d.action === "price" || d.action === "block") {
    const set = d.action === "price" ? { pricePaise: d.priceRupees! * 100 } : { blocked: true };
    await db
      .insert(stayCalendar)
      .values(days.map((day) => ({ orgId, day, ...(d.action === "price" ? { pricePaise: d.priceRupees! * 100 } : { blocked: true }) })))
      .onConflictDoUpdate({ target: [stayCalendar.orgId, stayCalendar.day], set });
  } else {
    await db
      .update(stayCalendar)
      .set(d.action === "clear_price" ? { pricePaise: null } : { blocked: false })
      .where(and(eq(stayCalendar.orgId, orgId), inArray(stayCalendar.day, days)));
  }
  await audit(db, { actorId: userId, action: `stay_calendar.${d.action}`, targetType: "organization", targetId: orgId, metadata: { from: d.from, to: d.to, priceRupees: d.priceRupees } });
  return { days: days.length };
}

/** Rooms held per night (accepted-and-unpaid holds count until they lapse). */
async function heldRooms(db: Executor, orgId: string, days: string[], exceptStayId?: string) {
  if (!days.length) return new Map<string, number>();
  const rows = await db
    .select({ day: stayNight.day, rooms: sql<number>`sum(${stayNight.rooms})::int` })
    .from(stayNight)
    .where(
      and(
        eq(stayNight.orgId, orgId),
        inArray(stayNight.day, days),
        or(isNull(stayNight.holdUntil), gte(stayNight.holdUntil, new Date())),
        exceptStayId ? sql`${stayNight.stayId} <> ${exceptStayId}` : undefined,
      ),
    )
    .groupBy(stayNight.day);
  return new Map(rows.map((r) => [r.day, r.rooms]));
}

async function calendarRows(db: Executor, orgId: string, days: string[]) {
  if (!days.length) return new Map<string, { pricePaise: number | null; blocked: boolean }>();
  const rows = await db.select().from(stayCalendar).where(and(eq(stayCalendar.orgId, orgId), inArray(stayCalendar.day, days)));
  return new Map(rows.map((r) => [r.day, { pricePaise: r.pricePaise, blocked: r.blocked }]));
}

/** A month of the host's calendar: price, blocked, rooms booked. Team members only. */
export async function getHostCalendar(userId: string, orgId: string, month: string) {
  await requireOrgRole(userId, orgId, ORG_ALL);
  const h = await getBookableHomestay(orgId);
  if (!h) throw notFound("Homestay not found");
  const m = /^\d{4}-\d{2}$/.test(month) ? month : todayIst().slice(0, 7);
  const first = new Date(`${m}-01T00:00:00Z`);
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const days = nightsOf(isoDay(first), isoDay(next));
  const db = getDb();
  const [cal, held] = [await calendarRows(db, orgId, days), await heldRooms(db, orgId, days)];
  return {
    month: m,
    prev: isoDay(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1))).slice(0, 7),
    next: isoDay(next).slice(0, 7),
    rooms: h.rooms,
    basePricePaise: h.priceFromPaise,
    today: todayIst(),
    days: days.map((day) => {
      const c = cal.get(day);
      return { day, pricePaise: c?.pricePaise ?? h.priceFromPaise, custom: c?.pricePaise != null, blocked: c?.blocked ?? false, booked: held.get(day) ?? 0 };
    }),
  };
}

// ---------- Quote and availability ----------

export const quoteInput = z
  .object({
    checkIn: ymd,
    checkOut: ymd,
    rooms: z.coerce.number().int().min(1).max(50).default(1),
    guests: z.coerce.number().int().min(1).max(200).default(1),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: "Check-out must be after check-in", path: ["checkOut"] });

type Homestay = NonNullable<Awaited<ReturnType<typeof getBookableHomestay>>>;

async function quoteFor(db: Executor, h: Homestay, d: z.output<typeof quoteInput>, exceptStayId?: string) {
  const nights = nightsOf(d.checkIn, d.checkOut);
  const today = todayIst();
  const latest = isoDay(new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000));
  const fail = (reason: string) => ({ ok: false as const, reason, nights: nights.length });
  if (!h.verified) return fail("This homestay isn't taking bookings yet");
  if (!h.priceFromPaise || h.rooms < 1) return fail("This homestay hasn't set its prices yet");
  if (d.checkIn < today) return fail("Choose a check-in date from today");
  if (d.checkIn > latest) return fail("Bookings open up to a year ahead");
  if (checkInInstant(d.checkIn, h.checkInTime).getTime() < Date.now()) return fail("Check-in time today has passed; choose a later date");
  if (nights.length < h.minNights) return fail(`The minimum stay is ${h.minNights} night${h.minNights > 1 ? "s" : ""}`);
  if (nights.length > MAX_NIGHTS) return fail(`Stays can be up to ${MAX_NIGHTS} nights; contact the host through a new request for longer`);
  if (d.rooms > h.rooms) return fail(`This homestay has ${h.rooms} room${h.rooms > 1 ? "s" : ""}`);
  if (h.maxGuests && d.guests > h.maxGuests) return fail(`Up to ${h.maxGuests} guests`);
  const [cal, held] = [await calendarRows(db, h.orgId, nights), await heldRooms(db, h.orgId, nights, exceptStayId)];
  const unavailable = nights.filter((n) => cal.get(n)?.blocked || (held.get(n) ?? 0) + d.rooms > h.rooms);
  if (unavailable.length) return { ...fail(`Not available on ${unavailable.length === 1 ? unavailable[0] : `${unavailable.length} of these nights`}`), unavailable };
  const nightly: NightPrice[] = nights.map((date) => ({ date, pricePaise: cal.get(date)?.pricePaise ?? h.priceFromPaise! }));
  const s = await stayMoneySettings(db);
  const price = priceStay(nightly, d.rooms, s);
  return { ok: true as const, nights: nights.length, price, policy: h.cancellationPolicy, policyText: POLICY_TEXT[h.cancellationPolicy as CancellationPolicy] };
}

/** Public price and availability for dates. Never throws for unavailability: returns { ok: false, reason }. */
export async function quoteStay(orgId: string, input: z.input<typeof quoteInput>) {
  const d = quoteInput.parse(input);
  const h = await getBookableHomestay(orgId);
  if (!h) throw notFound("Homestay not found");
  return quoteFor(getDb(), h, d);
}

/** Of these homestays, which have `rooms` free every night of the range. */
export async function filterAvailable(orgIds: string[], checkIn: string, checkOut: string, rooms = 1) {
  const nights = nightsOf(checkIn, checkOut);
  if (!orgIds.length || !nights.length || nights.length > MAX_NIGHTS) return new Set<string>();
  const db = getDb();
  const out = new Set<string>();
  for (const id of orgIds) {
    const h = await getBookableHomestay(id);
    if (!h) continue;
    const q = await quoteFor(db, h, { checkIn, checkOut, rooms, guests: 1 });
    if (q.ok) out.add(id);
  }
  return out;
}

export const searchInput = directoryInput.extend({ checkIn: ymd.optional(), checkOut: ymd.optional(), rooms: z.coerce.number().int().min(1).max(50).optional() });

/** Homestay directory search, optionally only those free for the dates. */
export async function searchHomestays(input: z.input<typeof searchInput>) {
  const d = searchInput.parse(input);
  const rows = await listDirectory("homestay", { city: d.city, q: d.q, feature: d.feature });
  if (!d.checkIn || !d.checkOut || d.checkOut <= d.checkIn) return { rows, dated: false };
  const free = await filterAvailable(rows.map((r) => r.listing.orgId), d.checkIn, d.checkOut, d.rooms ?? 1);
  return { rows: rows.filter((r) => free.has(r.listing.orgId)), dated: true };
}

// ---------- Requests (guest) ----------

const noContact = (v: string) => !/[\w.+-]+@[\w-]+\.[\w.]+/.test(v) && !/(\+?\d[\d\s-]{8,}\d)/.test(v);

export const stayRequestInput = z
  .object({
    checkIn: ymd,
    checkOut: ymd,
    rooms: z.coerce.number().int().min(1).max(50).default(1),
    guests: z.coerce.number().int().min(1).max(200).default(1),
    purpose: z.enum(STAY_PURPOSES),
    accessNeeds: z.array(z.enum(ACCESS_NEEDS)).default([]),
    message: z.string().trim().max(600).refine(noContact, "Leave out phone numbers and email addresses; you can share them once the stay is confirmed").default(""),
    billingName: z.string().trim().max(120).default(""),
    billingGstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5")
      .default(""),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: "Check-out must be after check-in", path: ["checkOut"] });

/** A signed-in member asks to stay. The price is fixed now; the host has 48 hours to answer. */
export async function requestStay(guest: { id: string }, orgId: string, input: z.input<typeof stayRequestInput>) {
  const d = stayRequestInput.parse(input);
  const h = await getBookableHomestay(orgId);
  if (!h || !h.verified) throw notFound("Homestay not found");
  if (await isActiveMember(guest.id, orgId)) throw forbidden("You can't book your own homestay");
  const q = await quoteFor(getDb(), h, d);
  if (!q.ok) throw badRequest(q.reason);
  return withScope({ userId: guest.id }, async (tx) => {
    const open = await tx.query.stay.findFirst({
      where: and(eq(stay.guestUserId, guest.id), eq(stay.orgId, orgId), inArray(stay.status, ["requested", "accepted"]), lt(stay.checkIn, d.checkOut), sql`${stay.checkOut} > ${d.checkIn}`),
    });
    if (open) throw badRequest("You already have an open request here for these dates");
    const now = Date.now();
    const respondBy = new Date(Math.min(now + RESPOND_HOURS * HOUR, checkInInstant(d.checkIn, h.checkInTime).getTime()));
    const p = q.price;
    const [row] = await tx
      .insert(stay)
      .values({
        orgId,
        guestUserId: guest.id,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        nights: q.nights,
        rooms: d.rooms,
        guests: d.guests,
        purpose: d.purpose,
        accessNeeds: d.accessNeeds,
        message: d.message,
        billingName: d.billingName,
        billingGstin: d.billingGstin,
        respondBy,
        nightly: p.nightly,
        gstParts: p.gstParts,
        subtotalPaise: p.subtotalPaise,
        gstPaise: p.gstPaise,
        totalPaise: p.totalPaise,
        commissionPaise: p.commissionPaise,
        payablePaise: p.payablePaise,
        cancellationPolicy: h.cancellationPolicy,
        idempotencyKey: `stay-${crypto.randomUUID()}`,
      })
      .returning();
    await enqueue(tx, { type: "stay.requested", payload: { stayId: row.id, orgId } });
    return row;
  });
}

// ---------- Expiry and completion ----------

/**
 * Lapses unanswered requests and unpaid acceptances (releasing their rooms)
 * and completes stays whose check-out date has passed. Runs within the
 * caller's scope (only the stays it can see) or with bypass from the cron.
 */
export async function expireStays(tx: Tx) {
  const now = new Date();
  const lapsedRequests = await tx
    .update(stay)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(stay.status, "requested"), lt(stay.respondBy, now)))
    .returning({ id: stay.id, guestUserId: stay.guestUserId });
  const lapsedOffers = await tx
    .update(stay)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(stay.status, "accepted"), eq(stay.paymentStatus, "unpaid"), lt(stay.payBy, now)))
    .returning({ id: stay.id, guestUserId: stay.guestUserId });
  if (lapsedOffers.length) await tx.delete(stayNight).where(inArray(stayNight.stayId, lapsedOffers.map((s) => s.id)));
  for (const s of lapsedRequests) await enqueue(tx, { type: "stay.expired", payload: { stayId: s.id, guestUserId: s.guestUserId, stage: "request" } });
  for (const s of lapsedOffers) await enqueue(tx, { type: "stay.expired", payload: { stayId: s.id, guestUserId: s.guestUserId, stage: "payment" } });
  await tx.update(stay).set({ status: "completed", updatedAt: now }).where(and(eq(stay.status, "confirmed"), lt(stay.checkOut, todayIst())));
  return { expired: lapsedRequests.length + lapsedOffers.length };
}

/** Cron entry point (platform job, like the outbox worker). */
export async function expireStaysJob() {
  return withScope({ userId: null, bypass: true }, (tx) => expireStays(tx));
}

// ---------- Host ----------

export const respondInput = z.object({ accept: z.boolean(), note: z.string().trim().max(400).default("") });

/** Accept (rooms are held for the guest to pay) or decline a request. Owners and admins. */
export async function respondToStay(userId: string, orgId: string, stayId: string, input: z.input<typeof respondInput>) {
  const d = respondInput.parse(input);
  assertUuid(stayId, "Stay");
  const h = await getBookableHomestay(orgId);
  if (!h) throw notFound("Homestay not found");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
    await expireStays(tx);
    // One acceptance at a time per homestay, so two can't take the last room.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);
    const [st] = await tx.select().from(stay).where(and(eq(stay.id, stayId), eq(stay.orgId, orgId))).for("update");
    if (!st) throw notFound("Stay not found");
    if (st.status !== "requested") throw badRequest(`This request is already ${STAY_STATUS_LABEL[st.status].toLowerCase()}`);
    const now = new Date();
    if (!d.accept) {
      const [row] = await tx.update(stay).set({ status: "declined", respondedAt: now, hostNote: d.note || null, updatedAt: now }).where(eq(stay.id, st.id)).returning();
      await enqueue(tx, { type: "stay.declined", payload: { stayId: st.id, guestUserId: st.guestUserId } });
      return row;
    }
    const nights = nightsOf(st.checkIn, st.checkOut);
    const [cal, held] = [await calendarRows(tx, orgId, nights), await heldRooms(tx, orgId, nights, st.id)];
    const clash = nights.find((n) => cal.get(n)?.blocked || (held.get(n) ?? 0) + st.rooms > h.rooms);
    if (clash) throw badRequest(`Not enough rooms free on ${clash}. Decline this request or free up the dates.`);
    const payBy = new Date(Math.min(now.getTime() + PAY_HOURS * HOUR, checkInInstant(st.checkIn, h.checkInTime).getTime()));
    await tx.insert(stayNight).values(nights.map((day) => ({ stayId: st.id, orgId, day, rooms: st.rooms, holdUntil: payBy })));
    const [row] = await tx.update(stay).set({ status: "accepted", respondedAt: now, payBy, hostNote: d.note || null, updatedAt: now }).where(eq(stay.id, st.id)).returning();
    await enqueue(tx, { type: "stay.accepted", payload: { stayId: st.id, guestUserId: st.guestUserId } });
    return row;
  });
}

export const cancelInput = z.object({ reason: z.string().trim().min(5, "Give a short reason (at least 5 characters)").max(400) });

/** The host cancels an accepted or confirmed stay: the guest is refunded in full. */
export async function hostCancelStay(userId: string, orgId: string, stayId: string, input: z.input<typeof cancelInput>) {
  const d = cancelInput.parse(input);
  assertUuid(stayId, "Stay");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
    const [st] = await tx.select().from(stay).where(and(eq(stay.id, stayId), eq(stay.orgId, orgId))).for("update");
    if (!st) throw notFound("Stay not found");
    if (st.status !== "accepted" && st.status !== "confirmed") throw badRequest("Only accepted or confirmed stays can be cancelled");
    if (st.checkOut <= todayIst()) throw badRequest("This stay has already ended");
    const refundPaise = st.paymentStatus === "unpaid" ? 0 : st.totalPaise - st.refundedPaise;
    return finishCancel(tx, st, { by: userId, byHost: true, reason: d.reason, refundPaise });
  });
}

async function finishCancel(tx: Tx, st: typeof stay.$inferSelect, o: { by: string; byHost: boolean; reason: string; refundPaise: number }) {
  const now = new Date();
  await tx.delete(stayNight).where(eq(stayNight.stayId, st.id));
  const [row] = await tx
    .update(stay)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: o.by, cancelledByHost: o.byHost, cancelReason: o.reason, updatedAt: now })
    .where(eq(stay.id, st.id))
    .returning();
  if (o.refundPaise > 0) {
    await createStayRefund(tx, { stayId: st.id, amountPaise: o.refundPaise, reason: o.byHost ? "Cancelled by the host" : "Cancelled by the guest", createdBy: o.by });
  }
  await audit(tx, { actorId: o.by, action: o.byHost ? "stay.cancel_by_host" : "stay.cancel_by_guest", targetType: "stay", targetId: st.id, metadata: { refundPaise: o.refundPaise, reason: o.reason } });
  await enqueue(tx, { type: "stay.cancelled", payload: { stayId: st.id, orgId: st.orgId, guestUserId: st.guestUserId, byHost: o.byHost, refundPaise: o.refundPaise } });
  return { stay: row, refundPaise: o.refundPaise };
}

/** The host's bookings: requests, upcoming, past. Guests are shown by first name; no contact details. */
export async function listHostStays(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    const m = await requireOrgRole(userId, orgId, ORG_ALL, tx);
    await expireStays(tx);
    const rows = await tx
      .select({ stay, guestName: user.name })
      .from(stay)
      .innerJoin(user, eq(user.id, stay.guestUserId))
      .where(eq(stay.orgId, orgId))
      .orderBy(asc(stay.checkIn));
    const today = todayIst();
    const shaped = rows.map(({ stay: s, guestName }) => ({
      ...s,
      guestFirstName: guestName.split(" ")[0],
      // The host earns its share of what wasn't refunded.
      hostSharePaise: s.paymentStatus === "unpaid" ? 0 : s.payablePaise - s.payableReversedPaise,
    }));
    return {
      canEdit: ORG_ADMINS.includes(m.role),
      requests: shaped.filter((s) => s.status === "requested"),
      awaitingPayment: shaped.filter((s) => s.status === "accepted"),
      upcoming: shaped.filter((s) => s.status === "confirmed" && s.checkOut >= today),
      past: shaped.filter((s) => !["requested", "accepted"].includes(s.status) && !(s.status === "confirmed" && s.checkOut >= today)).reverse().slice(0, 50),
    };
  });
}

/** Open requests for the navigation badge. */
export async function hostPendingCount(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(stay).where(and(eq(stay.orgId, orgId), eq(stay.status, "requested"), gte(stay.respondBy, new Date())));
    return r.n;
  });
}

// ---------- Guest ----------

export async function listMyStays(userId: string) {
  const rows = await withScope({ userId }, async (tx) => {
    await expireStays(tx);
    return tx.select().from(stay).where(eq(stay.guestUserId, userId)).orderBy(desc(stay.checkIn));
  });
  const names = await homestayNames(rows.map((r) => r.orgId));
  return rows.map((s) => ({ ...s, homestay: names.get(s.orgId) ?? null }));
}

export async function getMyStay(userId: string, stayId: string) {
  assertUuid(stayId, "Stay");
  const data = await withScope({ userId }, async (tx) => {
    await expireStays(tx);
    const st = await tx.query.stay.findFirst({ where: and(eq(stay.id, stayId), eq(stay.guestUserId, userId)) });
    if (!st) throw notFound("Stay not found");
    return { stay: st, money: await stayMoneyForGuest(tx, st.id) };
  });
  const h = await getBookableHomestay(data.stay.orgId);
  const cancel =
    data.stay.status === "confirmed" && data.stay.paymentStatus !== "unpaid"
      ? guestCancellationRefund(data.stay.cancellationPolicy, data.stay.totalPaise - data.stay.refundedPaise, data.stay.checkIn, h?.checkInTime ?? "14:00")
      : { allowed: ["requested", "accepted"].includes(data.stay.status), amountPaise: 0, bps: 0 };
  return {
    ...data,
    homestay: h,
    policyText: POLICY_TEXT[data.stay.cancellationPolicy as CancellationPolicy],
    cancel,
  };
}

/** The guest cancels: no charge before payment; after payment, refunded by the stay's policy. */
export async function cancelStayAsGuest(userId: string, stayId: string, input: z.input<typeof cancelInput>) {
  const d = cancelInput.parse(input);
  assertUuid(stayId, "Stay");
  const st0 = await withScope({ userId }, (tx) => tx.query.stay.findFirst({ where: and(eq(stay.id, stayId), eq(stay.guestUserId, userId)) }));
  if (!st0) throw notFound("Stay not found");
  const h = await getBookableHomestay(st0.orgId);
  return withScope({ userId }, async (tx) => {
    const [st] = await tx.select().from(stay).where(and(eq(stay.id, stayId), eq(stay.guestUserId, userId))).for("update");
    if (!st) throw notFound("Stay not found");
    if (!["requested", "accepted", "confirmed"].includes(st.status)) throw badRequest("This stay can't be cancelled");
    let refundPaise = 0;
    if (st.paymentStatus !== "unpaid") {
      const r = guestCancellationRefund(st.cancellationPolicy, st.totalPaise - st.refundedPaise, st.checkIn, h?.checkInTime ?? "14:00");
      if (!r.allowed) throw badRequest("Stays can't be cancelled after check-in. Talk to the host or contact support.");
      refundPaise = r.amountPaise;
    }
    return finishCancel(tx, st, { by: userId, byHost: false, reason: d.reason, refundPaise });
  });
}

/** Details a guest is shown for a host's team when the stay is confirmed (first names only; contact via messages later). */
export const stayLabels = { PURPOSE_LABEL, ACCESS_LABEL, STAY_STATUS_LABEL };

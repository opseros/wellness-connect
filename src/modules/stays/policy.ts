// Pure rules for homestay stays: nights, prices, GST and cancellation refunds.
// No database access, so they're unit-tested directly.
import type { GstPart, NightPrice } from "@/db/schema";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** "YYYY-MM-DD" → a Date at midnight UTC (dates are calendar days, not instants). */
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Every night of a stay: check-in up to but not including check-out. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let t = utc(checkIn).getTime(); t < utc(checkOut).getTime(); t += DAY) out.push(isoDay(new Date(t)));
  return out;
}

/** Today's date in India. */
export function todayIst(now = new Date()) {
  return isoDay(new Date(now.getTime() + 330 * 60_000));
}

/** The check-in moment in India time, e.g. 2027-03-15 14:00 IST. */
export function checkInInstant(checkIn: string, checkInTime = "14:00") {
  return new Date(`${checkIn}T${/^\d{2}:\d{2}$/.test(checkInTime) ? checkInTime : "14:00"}:00+05:30`);
}

export type StayMoneySettings = { commissionBps: number; gstLowBps: number; gstHighBps: number; thresholdPaise: number };

export type StayPrice = {
  nightly: NightPrice[];
  rooms: number;
  subtotalPaise: number;
  gstParts: GstPart[];
  gstPaise: number;
  totalPaise: number;
  commissionPaise: number;
  payablePaise: number;
};

/**
 * Price of a stay. `nightly` is the price per room for each night. GST on
 * accommodation depends on the tariff per room per night: at or below the
 * threshold the low rate applies, above it the high rate. The platform's
 * commission is a share of the room charges (before GST) taken from the host.
 */
export function priceStay(nightly: NightPrice[], rooms: number, s: StayMoneySettings): StayPrice {
  if (!nightly.length) throw new Error("A stay needs at least one night");
  if (rooms < 1) throw new Error("At least one room");
  const byRate = new Map<number, number>();
  for (const n of nightly) {
    const rate = n.pricePaise <= s.thresholdPaise ? s.gstLowBps : s.gstHighBps;
    byRate.set(rate, (byRate.get(rate) ?? 0) + n.pricePaise * rooms);
  }
  const gstParts = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rateBps, taxablePaise]) => ({ rateBps, taxablePaise, gstPaise: Math.round((taxablePaise * rateBps) / 10_000) }));
  const subtotalPaise = gstParts.reduce((a, p) => a + p.taxablePaise, 0);
  const gstPaise = gstParts.reduce((a, p) => a + p.gstPaise, 0);
  const commissionPaise = Math.round((subtotalPaise * s.commissionBps) / 10_000);
  return { nightly, rooms, subtotalPaise, gstParts, gstPaise, totalPaise: subtotalPaise + gstPaise, commissionPaise, payablePaise: subtotalPaise - commissionPaise };
}

export type CancellationPolicy = "flexible" | "moderate" | "strict";

/** Refund tiers: cancel at least `hours` before check-in → `bps` of the total back. Later than every tier: nothing. */
const TIERS: Record<CancellationPolicy, { hours: number; bps: number }[]> = {
  flexible: [
    { hours: 24, bps: 10_000 },
    { hours: 0, bps: 5_000 },
  ],
  moderate: [
    { hours: 5 * 24, bps: 10_000 },
    { hours: 24, bps: 5_000 },
  ],
  strict: [
    { hours: 14 * 24, bps: 10_000 },
    { hours: 7 * 24, bps: 5_000 },
  ],
};

export const POLICY_TEXT: Record<CancellationPolicy, { name: string; text: string }> = {
  flexible: { name: "Flexible", text: "Full refund up to 24 hours before check-in; 50% after that until check-in." },
  moderate: { name: "Moderate", text: "Full refund up to 5 days before check-in; 50% up to 24 hours before; no refund after that." },
  strict: { name: "Strict", text: "Full refund up to 14 days before check-in; 50% up to 7 days before; no refund after that." },
};

/**
 * What a guest gets back for cancelling a paid stay now. A host cancelling, or
 * declining, always refunds in full (handled by the caller). After check-in
 * there is no self-service cancellation.
 */
export function guestCancellationRefund(policy: string, totalPaise: number, checkIn: string, checkInTime: string, now = new Date()) {
  const start = checkInInstant(checkIn, checkInTime).getTime();
  if (now.getTime() >= start) return { allowed: false as const, amountPaise: 0, bps: 0 };
  const hoursBefore = (start - now.getTime()) / HOUR;
  const tiers = TIERS[(policy in TIERS ? policy : "moderate") as CancellationPolicy];
  const bps = tiers.find((t) => hoursBefore >= t.hours)?.bps ?? 0;
  return { allowed: true as const, amountPaise: Math.round((totalPaise * bps) / 10_000), bps };
}

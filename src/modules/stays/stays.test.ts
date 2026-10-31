import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import { withScope, type DB } from "@/db/client";
import { listing, membership, stay, stayInvoice, stayLedgerEntry, stayNight } from "@/db/schema";
import { setRazorpayFetchForTesting } from "@/lib/razorpay";
import { sentEmails } from "@/lib/email";
import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";
import { handleRazorpayWebhook } from "@/modules/marketplace/payments";
import { confirmStayCheckout, recordStayPayoutAsStaff, startStayPayment, stayFinanceOverview } from "@/modules/marketplace/stay-payments";
import { createListingOrg } from "@/modules/listings/service";
import { guestCancellationRefund, isoDay, priceStay, todayIst } from "./policy";
import {
  cancelStayAsGuest,
  expireStaysJob,
  getHostCalendar,
  getMyStay,
  hostCancelStay,
  listHostStays,
  quoteStay,
  requestStay,
  respondToStay,
  searchHomestays,
  updateCalendar,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let host: { id: string; email: string; emailVerified: boolean; name: string };
let guest: { id: string; email: string; name: string };
let guest2: { id: string; email: string; name: string };
let staff: { id: string };
let orgId: string;
let refundStatus: "pending" | "processed" = "processed";
let orderN = 0;

const KEY_SECRET = "test_key_secret";
const HOOK_SECRET = "test_webhook_secret";
const sign = (s: string, secret: string) => createHmac("sha256", secret).update(s).digest("hex");
const plus = (days: number) => isoDay(new Date(new Date(`${todayIst()}T00:00:00Z`).getTime() + days * 86_400_000));
const bypass = <T,>(fn: Parameters<typeof withScope<T>>[1]) => withScope({ userId: null, bypass: true }, fn);

async function pay(who: { id: string; name: string; email: string }, stayId: string) {
  const o = await startStayPayment(who, stayId);
  const pid = `pay_${++orderN}`;
  return confirmStayCheckout(who.id, { razorpay_order_id: o.orderId, razorpay_payment_id: pid, razorpay_signature: sign(`${o.orderId}|${pid}`, KEY_SECRET) });
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  process.env.RAZORPAY_KEY_ID = "rzp_test_123";
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = HOOK_SECRET;
  setRazorpayFetchForTesting(async (url, init) => {
    const path = String(url).replace("https://api.razorpay.com/v1", "");
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (path === "/orders") return Response.json({ id: `order_${++orderN}`, amount: body.amount, currency: "INR", receipt: body.receipt, status: "created" });
    if (path.endsWith("/refund")) return Response.json({ id: `rfnd_${++orderN}`, payment_id: path.split("/")[2], amount: body.amount, status: refundStatus });
    return new Response("{}", { status: 404 });
  });
  const h = await makeUser(db, "host@example.test", "Asha Host");
  host = { ...h, emailVerified: true };
  guest = await makeUser(db, "farah@example.test", "Farah Khan");
  guest2 = await makeUser(db, "dev@example.test", "Dev Rao");
  staff = await makeUser(db, "finance@opseros.com");
  orgId = (await createListingOrg(host, { kind: "homestay", name: "Aranya Garden Stay", city: "Mysuru" })).id;
  await db
    .update(listing)
    .set({ status: "verified", verifiedAt: new Date(), rooms: 2, maxGuests: 4, priceFromPaise: 3_200_00, state: "Karnataka", cancellationPolicy: "moderate", minNights: 2 })
    .where(eq(listing.orgId, orgId));
});
afterAll(async () => {
  setRazorpayFetchForTesting(undefined);
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  await t.close();
});
beforeEach(() => {
  refundStatus = "processed";
});

describe("pricing and policy rules", () => {
  it("applies GST per night by tariff, and commission on room charges", () => {
    const p = priceStay([{ date: "2027-03-15", pricePaise: 7_500_00 }, { date: "2027-03-16", pricePaise: 8_000_00 }], 2, { commissionBps: 1200, gstLowBps: 500, gstHighBps: 1800, thresholdPaise: 7_500_00 });
    expect(p.gstParts).toEqual([
      { rateBps: 500, taxablePaise: 15_000_00, gstPaise: 75_000 },
      { rateBps: 1800, taxablePaise: 16_000_00, gstPaise: 2_88_000 },
    ]);
    expect(p.subtotalPaise).toBe(31_000_00);
    expect(p.totalPaise).toBe(31_000_00 + 3_63_000);
    expect(p.commissionPaise).toBe(3_72_000);
    expect(p.payablePaise + p.commissionPaise).toBe(p.subtotalPaise);
  });

  it("refunds by policy tier and not after check-in", () => {
    const checkIn = "2027-03-15";
    const at = (iso: string) => new Date(iso);
    expect(guestCancellationRefund("moderate", 10_000, checkIn, "14:00", at("2027-03-09T14:00:00+05:30")).bps).toBe(10_000);
    expect(guestCancellationRefund("moderate", 10_000, checkIn, "14:00", at("2027-03-12T14:00:00+05:30")).amountPaise).toBe(5_000);
    expect(guestCancellationRefund("moderate", 10_000, checkIn, "14:00", at("2027-03-15T04:00:00+05:30")).amountPaise).toBe(0);
    expect(guestCancellationRefund("flexible", 10_000, checkIn, "14:00", at("2027-03-15T04:00:00+05:30")).amountPaise).toBe(5_000);
    expect(guestCancellationRefund("strict", 10_000, checkIn, "14:00", at("2027-03-05T14:00:00+05:30")).amountPaise).toBe(5_000);
    expect(guestCancellationRefund("moderate", 10_000, checkIn, "14:00", at("2027-03-15T15:00:00+05:30")).allowed).toBe(false);
  });
});

describe("calendar, quotes and requests", () => {
  it("uses the host's prices and blocked dates; only admins edit", async () => {
    await updateCalendar(host.id, orgId, { from: plus(30), to: plus(30), action: "price", priceRupees: 4000 });
    await updateCalendar(host.id, orgId, { from: plus(40), to: plus(41), action: "block" });
    const member = await makeUser(db);
    await db.insert(membership).values({ orgId, userId: member.id, role: "member", status: "active" });
    await expect(updateCalendar(member.id, orgId, { from: plus(50), to: plus(50), action: "block" })).rejects.toMatchObject({ status: 403 });
    const q = await quoteStay(orgId, { checkIn: plus(30), checkOut: plus(32), rooms: 1 });
    expect(q.ok && q.price.nightly.map((n) => n.pricePaise)).toEqual([4_000_00, 3_200_00]);
    expect((await quoteStay(orgId, { checkIn: plus(39), checkOut: plus(42) })).ok).toBe(false);
    expect((await quoteStay(orgId, { checkIn: plus(30), checkOut: plus(31) })).ok).toBe(false); // min 2 nights
    expect((await quoteStay(orgId, { checkIn: plus(30), checkOut: plus(32), rooms: 3 })).ok).toBe(false);
    const cal = await getHostCalendar(host.id, orgId, plus(40).slice(0, 7));
    expect(cal.days.find((d) => d.day === plus(40))?.blocked).toBe(true);
  });

  it("refuses own homestay, contact details in messages, and impossible dates", async () => {
    const base = { checkIn: plus(20), checkOut: plus(23), purpose: "rest" as const };
    await expect(requestStay(host, orgId, base)).rejects.toMatchObject({ status: 403 });
    await expect(requestStay(guest, orgId, { ...base, message: "Call me on 98450 12345" })).rejects.toThrow(/phone numbers/);
    await expect(requestStay(guest, orgId, { ...base, checkIn: plus(-2), checkOut: plus(1) })).rejects.toMatchObject({ status: 400 });
  });
});

describe("request → accept → pay → cancel, with the ledger reconciling", () => {
  let stayA: string;

  it("accepting holds rooms; a clashing request can't be accepted", async () => {
    sentEmails.length = 0;
    const r = await requestStay(guest, orgId, { checkIn: plus(20), checkOut: plus(23), rooms: 2, guests: 3, purpose: "care", accessNeeds: ["step_free", "special_diet"], message: "Recovering after knee surgery" });
    stayA = r.id;
    expect(r.status).toBe("requested");
    expect(r.totalPaise).toBe(3 * 2 * 3_200_00 + Math.round(3 * 2 * 3_200_00 * 0.05));
    await expect(requestStay(guest, orgId, { checkIn: plus(21), checkOut: plus(24), purpose: "rest" })).rejects.toThrow(/already have an open request/);
    const r2 = await requestStay(guest2, orgId, { checkIn: plus(21), checkOut: plus(23), purpose: "rest" });
    await processOutbox();
    expect(sentEmails.some((e) => e.to === host.email && /New booking request/.test(e.subject))).toBe(true);
    await expect(respondToStay(guest.id, orgId, stayA, { accept: true })).rejects.toMatchObject({ status: 403 });
    await respondToStay(host.id, orgId, stayA, { accept: true });
    await expect(respondToStay(host.id, orgId, r2.id, { accept: true })).rejects.toThrow(/Not enough rooms/);
    await respondToStay(host.id, orgId, r2.id, { accept: false, note: "Fully booked, sorry" });
    expect((await quoteStay(orgId, { checkIn: plus(21), checkOut: plus(23) })).ok).toBe(false);
    expect((await searchHomestays({ checkIn: plus(21), checkOut: plus(23) })).rows).toHaveLength(0);
    expect((await searchHomestays({ checkIn: plus(60), checkOut: plus(62) })).rows).toHaveLength(1);
  });

  it("only the guest sees their stay; the host sees first name only", async () => {
    await expect(getMyStay(guest2.id, stayA)).rejects.toMatchObject({ status: 404 });
    expect(await withScope({ userId: guest2.id }, (tx) => tx.select().from(stay).where(eq(stay.id, stayA)))).toHaveLength(0);
    const h = await listHostStays(host.id, orgId);
    expect(h.awaitingPayment[0]).toMatchObject({ id: stayA, guestFirstName: "Farah" });
    expect(h.awaitingPayment[0]).not.toHaveProperty("guestEmail");
  });

  it("paying confirms the stay with a GST invoice for the property's state, and the ledger balances", async () => {
    await expect(startStayPayment(guest2, stayA)).rejects.toMatchObject({ status: 404 });
    const res = await pay(guest, stayA);
    expect(res.status).toBe("paid");
    const mine = await getMyStay(guest.id, stayA);
    expect(mine.stay.status).toBe("confirmed");
    const inv = mine.money.invoices[0];
    expect(inv.number).toMatch(/^MSMS\/\d{4}-\d{2}\/0001$/);
    expect(inv.placeOfSupply).toContain("29");
    expect(inv.cgstPaise + inv.sgstPaise).toBe(mine.stay.gstPaise);
    expect(inv.totalPaise).toBe(mine.stay.totalPaise);
    // Guests can't read the commission split; nor can another org.
    expect(await withScope({ userId: guest.id }, (tx) => tx.select().from(stayLedgerEntry))).toHaveLength(0);
    expect(await withScope({ userId: guest.id }, (tx) => tx.select().from(stayInvoice))).toHaveLength(1);
    const o = await stayFinanceOverview();
    expect(o.balanced).toBe(true);
    expect(o.paymentsMatchLedger).toBe(true);
    expect(o.payablePaise).toBe(mine.stay.payablePaise);
    expect(await db.select().from(stayNight).where(eq(stayNight.stayId, stayA))).toHaveLength(3);
    await expect(pay(guest, stayA)).rejects.toMatchObject({ status: 409 });
  });

  it("guest cancels inside the 50% window: half back, credit note, host share reversed", async () => {
    // Move check-in to 3 days away (moderate: 50% between 5 days and 24 hours).
    await bypass((tx) => tx.update(stay).set({ checkIn: plus(3), checkOut: plus(6) }).where(eq(stay.id, stayA)));
    const before = await getMyStay(guest.id, stayA);
    expect(before.cancel).toMatchObject({ allowed: true, bps: 5_000 });
    const r = await cancelStayAsGuest(guest.id, stayA, { reason: "Surgery moved to April" });
    expect(r.refundPaise).toBe(Math.round(before.stay.totalPaise / 2));
    await processOutbox();
    const after = await getMyStay(guest.id, stayA);
    expect(after.stay.paymentStatus).toBe("partially_refunded");
    expect(after.money.invoices.map((i) => i.kind)).toEqual(["invoice", "credit_note"]);
    expect(after.money.invoices[1].totalPaise).toBe(r.refundPaise);
    expect(after.stay.payableReversedPaise).toBeGreaterThan(0);
    expect(await db.select().from(stayNight).where(eq(stayNight.stayId, stayA))).toHaveLength(0);
    const o = await stayFinanceOverview();
    expect(o.balanced).toBe(true);
    expect(o.mismatchedStays).toEqual([]);
  });

  it("host cancelling a confirmed stay refunds in full", async () => {
    const r = await requestStay(guest2, orgId, { checkIn: plus(70), checkOut: plus(72), purpose: "retreat", billingName: "Northwind Labs", billingGstin: "29ABCDE1234F1Z5" });
    await respondToStay(host.id, orgId, r.id, { accept: true });
    await pay(guest2, r.id);
    const inv = (await getMyStay(guest2.id, r.id)).money.invoices[0];
    expect(inv.buyer).toMatchObject({ name: "Northwind Labs", gstin: "29ABCDE1234F1Z5" });
    await expect(hostCancelStay(host.id, orgId, r.id, { reason: "no" })).rejects.toBeTruthy();
    const c = await hostCancelStay(host.id, orgId, r.id, { reason: "Water supply problem that week" });
    expect(c.refundPaise).toBe(r.totalPaise);
    await processOutbox();
    expect((await getMyStay(guest2.id, r.id)).stay.paymentStatus).toBe("refunded");
    expect((await stayFinanceOverview()).balanced).toBe(true);
  });
});

describe("expiry, late payments and payouts", () => {
  it("an unpaid acceptance lapses and frees the rooms; a late capture is refunded in full", async () => {
    const r = await requestStay(guest, orgId, { checkIn: plus(80), checkOut: plus(82), rooms: 2, purpose: "rest" });
    await respondToStay(host.id, orgId, r.id, { accept: true });
    const order = await startStayPayment(guest, r.id);
    await bypass(async (tx) => {
      const lapsed = new Date(Date.now() - 60_000);
      await tx.update(stay).set({ payBy: lapsed }).where(eq(stay.id, r.id));
      await tx.update(stayNight).set({ holdUntil: lapsed }).where(eq(stayNight.stayId, r.id));
    });
    expect((await quoteStay(orgId, { checkIn: plus(80), checkOut: plus(82), rooms: 2 })).ok).toBe(true); // lapsed hold no longer counts
    await expireStaysJob();
    expect((await getMyStay(guest.id, r.id)).stay.status).toBe("expired");
    await expect(startStayPayment(guest, r.id)).rejects.toMatchObject({ status: 400 });
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_late", order_id: order.orderId, amount: order.amountPaise, method: "upi" } } } });
    const res = await handleRazorpayWebhook(body, sign(body, HOOK_SECRET), "evt_late");
    expect(res).toMatchObject({ result: { status: "refunded_unavailable" } });
    expect(await handleRazorpayWebhook(body, sign(body, HOOK_SECRET), "evt_late")).toEqual({ duplicate: true });
    await processOutbox();
    const o = await stayFinanceOverview();
    expect(o.balanced).toBe(true);
    expect(o.paymentsMatchLedger).toBe(true);
  });

  it("hosts are paid after check-in, never more than they're owed", async () => {
    const r = await requestStay(guest, orgId, { checkIn: plus(90), checkOut: plus(93), purpose: "rest" });
    await respondToStay(host.id, orgId, r.id, { accept: true });
    await pay(guest, r.id);
    await expect(recordStayPayoutAsStaff(staff.id, r.id, { amountRupees: 100, reference: "UTR0001", paidOn: todayIst() })).rejects.toThrow(/after check-in/);
    await bypass((tx) => tx.update(stay).set({ checkIn: plus(-1), checkOut: plus(2) }).where(eq(stay.id, r.id)));
    const owed = r.payablePaise / 100;
    await expect(recordStayPayoutAsStaff(staff.id, r.id, { amountRupees: owed + 1, reference: "UTR0002", paidOn: todayIst() })).rejects.toMatchObject({ status: 400 });
    await recordStayPayoutAsStaff(staff.id, r.id, { amountRupees: owed, reference: "UTR0003", paidOn: todayIst() });
    const o = await stayFinanceOverview();
    expect(o.balanced).toBe(true);
    expect(o.paidOutPaise).toBe(r.payablePaise);
    await expect(cancelStayAsGuest(guest.id, r.id, { reason: "Changed plans" })).rejects.toThrow(/after check-in/);
  });
});

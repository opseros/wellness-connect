import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import { withScope, type DB } from "@/db/client";
import { booking, invoice, ledgerEntry, payout, refund } from "@/db/schema";
import { sentEmails } from "@/lib/email";
import { setRazorpayFetchForTesting } from "@/lib/razorpay";
import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";
import { createOrganization } from "@/modules/organizations/service";
import { renderInvoicePdf } from "./invoice-pdf";
import {
  acceptProposal,
  cancelBooking,
  confirmCheckout,
  createRequirement,
  financeOverview,
  financialYear,
  getOrgInvoice,
  getPaymentOptions,
  handleRazorpayWebhook,
  listMyBookings,
  listOrgInvoices,
  markInvoicePaidAsStaff,
  priceBooking,
  recordPayoutAsStaff,
  requestInvoice,
  sendEnquiries,
  splitGst,
  splitRefund,
  startOnlinePayment,
  submitProposal,
  summarizeEarnings,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let catId: string;
let staff: { id: string };
const calls: { path: string; body: Record<string, unknown>; idem: string | null }[] = [];
let refundStatus: "pending" | "processed" = "pending";

const KEY_SECRET = "test_key_secret";
const HOOK_SECRET = "test_webhook_secret";
const sign = (s: string, secret: string) => createHmac("sha256", secret).update(s).digest("hex");

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  catId = (await categoryBySlug(db, "yoga-mindfulness")).id;
  staff = await makeUser(db, "finance@opseros.com");
  process.env.RAZORPAY_KEY_ID = "rzp_test_123";
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = HOOK_SECRET;
  // A fake Razorpay: orders and refunds, no network.
  setRazorpayFetchForTesting(async (url, init) => {
    const path = String(url).replace("https://api.razorpay.com/v1", "");
    const body = JSON.parse(String(init?.body ?? "{}"));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ path, body, idem: headers["x-razorpay-idempotency"] ?? null });
    if (path === "/orders") return Response.json({ id: `order_${calls.length}`, amount: body.amount, currency: "INR", receipt: body.receipt, status: "created" });
    if (path.endsWith("/refund")) return Response.json({ id: `rfnd_${calls.length}`, payment_id: path.split("/")[2], amount: body.amount, status: refundStatus });
    return new Response("{}", { status: 404 });
  });
});
afterAll(async () => {
  setRazorpayFetchForTesting(undefined);
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  await t.close();
});
beforeEach(() => {
  refundStatus = "pending";
});

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

/** A company with a ₹40,000 accepted booking 30 days out. */
async function bookedSession(domain: string, opts: { days?: number; cancellationDays?: number } = {}) {
  const buyer = { ...(await makeUser(db, `hr@${domain}`)), emailVerified: true };
  const org = await createOrganization(buyer, { name: domain });
  const pro = await makeProfessional(db, { categoryId: catId });
  const req = await createRequirement(buyer.id, org.id, {
    title: "Team mindfulness",
    categoryId: catId,
    city: "Bengaluru",
    deliveryMode: "in_person",
    participants: 40,
    budgetMinRupees: 30_000,
    budgetMaxRupees: 50_000,
    publish: true,
  });
  await sendEnquiries(buyer.id, org.id, req.id, [pro.user.id]);
  const p = await submitProposal(pro.user.id, req.id, {
    feeRupees: 40_000,
    proposedStart: inDays(opts.days ?? 30),
    maxParticipants: 40,
    freeCancellationDays: opts.cancellationDays ?? 7,
  });
  const b = await acceptProposal(buyer.id, org.id, p.id, `accept-${p.id}`);
  return { buyer, org, pro, booking: b };
}

async function ledgerFor(bookingId: string) {
  return withScope({ userId: null, bypass: true }, (tx) => tx.select().from(ledgerEntry).where(eq(ledgerEntry.bookingId, bookingId)));
}
const sum = (rows: { entryType: string; amountPaise: number }[], type: string) => rows.filter((r) => r.entryType === type).reduce((n, r) => n + r.amountPaise, 0);

function webhook(event: string, payload: object, id: string, secret = HOOK_SECRET) {
  const body = JSON.stringify({ event, payload });
  return handleRazorpayWebhook(body, sign(body, secret), id);
}

describe("money maths", () => {
  it("prices a booking: GST on the whole fee, commission from the professional's share", () => {
    expect(priceBooking(4_000_000, 1000, 1800)).toEqual({ feePaise: 4_000_000, gstPaise: 720_000, totalPaise: 4_720_000, commissionPaise: 400_000, payablePaise: 3_600_000 });
    expect(priceBooking(3_333_333, 1000, 1800)).toMatchObject({ gstPaise: 600_000, commissionPaise: 333_333, payablePaise: 3_000_000 });
  });

  it("splits refunds and GST exactly, to the paisa", () => {
    const p = priceBooking(3_333_333, 1000, 1800);
    for (const amount of [1, 7, 1_000_001, p.totalPaise]) {
      const s = splitRefund(p, amount);
      expect(s.gstPaise + s.commissionPaise + s.payablePaise).toBe(amount);
    }
    expect(splitGst(720_001, "29", "29")).toEqual({ cgstPaise: 360_000, sgstPaise: 360_001, igstPaise: 0 });
    expect(splitGst(720_000, "29", "27")).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 720_000 });
  });

  it("numbers invoices by Indian financial year", () => {
    expect(financialYear(new Date("2027-03-31T18:31:00Z"))).toBe("2027-28"); // 00:01 on 1 April in India
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("2026-27"); // 23:30 on 31 March
    expect(financialYear(new Date("2027-03-31T10:00:00Z"))).toBe("2026-27");
  });
});

describe("online payment with Razorpay", () => {
  it("pays, invoices, refunds and reconciles to the paisa; replays change nothing", async () => {
    const { buyer, org, pro, booking: b } = await bookedSession("alpha.in");
    expect(b).toMatchObject({ feePaise: 4_000_000, gstPaise: 720_000, totalPaise: 4_720_000, payablePaise: 3_600_000, paymentStatus: "unpaid" });

    const start = await startOnlinePayment(buyer, org.id, b.id);
    expect(start).toMatchObject({ keyId: "rzp_test_123", amountPaise: 4_720_000 });
    expect(calls.at(-1)?.body).toMatchObject({ amount: 4_720_000, currency: "INR" });
    // Clicking Pay again reuses the same order.
    expect((await startOnlinePayment(buyer, org.id, b.id)).orderId).toBe(start.orderId);

    await expect(
      confirmCheckout(buyer.id, org.id, { razorpay_order_id: start.orderId, razorpay_payment_id: "pay_1", razorpay_signature: "f".repeat(64) }),
    ).rejects.toMatchObject({ status: 400 });
    const ok = await confirmCheckout(buyer.id, org.id, {
      razorpay_order_id: start.orderId,
      razorpay_payment_id: "pay_1",
      razorpay_signature: sign(`${start.orderId}|pay_1`, KEY_SECRET),
    });
    expect(ok.status).toBe("paid");

    // The webhook for the same payment arrives later: nothing changes.
    const capture = { payment: { entity: { id: "pay_1", order_id: start.orderId, amount: 4_720_000, method: "upi" } } };
    expect(await webhook("payment.captured", capture, "evt_1")).toMatchObject({ result: { status: "already_paid" } });
    expect(await webhook("payment.captured", capture, "evt_1")).toEqual({ duplicate: true });
    await expect(webhook("payment.captured", capture, "evt_2", "wrong-secret")).rejects.toMatchObject({ status: 403 });

    let ledger = await ledgerFor(b.id);
    expect(ledger).toHaveLength(4);
    expect(sum(ledger, "gross")).toBe(sum(ledger, "tax") + sum(ledger, "platform_commission") + sum(ledger, "provider_payable"));
    const opts = await getPaymentOptions(buyer.id, org.id, b.id);
    expect(opts.status).toBe("paid");
    const [inv] = opts.invoices;
    expect(inv).toMatchObject({ kind: "invoice", status: "paid", taxablePaise: 4_000_000, cgstPaise: 360_000, sgstPaise: 360_000, totalPaise: 4_720_000 });
    expect(inv.number).toMatch(/^MSM\/\d{4}-\d{2}\/0001$/);
    const pdf = await renderInvoicePdf(inv);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");

    // Free cancellation → full refund through Razorpay.
    const c = await cancelBooking(buyer.id, org.id, b.id, { reason: "Offsite moved to next quarter" });
    expect(c.refundPaise).toBe(4_720_000);
    await processOutbox();
    const refundCall = calls.find((x) => x.path === "/payments/pay_1/refund")!;
    expect(refundCall.body).toMatchObject({ amount: 4_720_000 });
    expect(refundCall.idem).toBeTruthy(); // idempotency key = our refund id
    const rfndId = (await getPaymentOptions(buyer.id, org.id, b.id)).refunds[0].providerRefundId!;
    const processed = { refund: { entity: { id: rfndId, payment_id: "pay_1", amount: 4_720_000, status: "processed", notes: { refundId: refundCall.body.notes && (refundCall.body.notes as Record<string, string>).refundId } } } };
    await webhook("refund.processed", processed, "evt_r1");
    expect(await webhook("refund.processed", processed, "evt_r2")).toMatchObject({ result: { changed: false } });

    ledger = await ledgerFor(b.id);
    expect(sum(ledger, "gross") - sum(ledger, "refund")).toBe(0);
    expect(sum(ledger, "tax") + sum(ledger, "platform_commission") + sum(ledger, "provider_payable")).toBe(0);
    const after = await getPaymentOptions(buyer.id, org.id, b.id);
    expect(after.status).toBe("refunded");
    expect(after.invoices.map((i) => i.kind)).toEqual(["invoice", "credit_note"]);
    expect(after.invoices[1]).toMatchObject({ totalPaise: 4_720_000, relatedInvoiceId: inv.id });
    await processOutbox();
    expect(sentEmails.some((e) => e.to === buyer.email && e.subject.startsWith("Refund of ₹47,200.00"))).toBe(true);
    expect(summarizeEarnings(await listMyBookings(pro.user.id))).toMatchObject({ earnedPaise: 0, duePaise: 0 });
  });

  it("a late cancellation keeps the payment (no refund by default)", async () => {
    const { buyer, org, booking: b } = await bookedSession("beta.in", { days: 3, cancellationDays: 7 });
    const { orderId } = await startOnlinePayment(buyer, org.id, b.id);
    await webhook("order.paid", { payment: { entity: { id: "pay_late", order_id: orderId, amount: 4_720_000 } } }, "evt_late");
    const c = await cancelBooking(buyer.id, org.id, b.id, { reason: "Change of plans" });
    expect(c).toMatchObject({ cancelledLate: true, refundPaise: 0 });
    expect((await getPaymentOptions(buyer.id, org.id, b.id)).refunds).toHaveLength(0);
  });

  it("ignores a capture whose amount doesn't match the order", async () => {
    const { buyer, org, booking: b } = await bookedSession("gamma.in");
    const { orderId } = await startOnlinePayment(buyer, org.id, b.id);
    expect(await webhook("payment.captured", { payment: { entity: { id: "pay_x", order_id: orderId, amount: 100 } } }, "evt_x")).toMatchObject({ result: { status: "amount_mismatch" } });
    expect((await getPaymentOptions(buyer.id, org.id, b.id)).status).toBe("unpaid");
    expect(await ledgerFor(b.id)).toHaveLength(0);
  });
});

describe("pay by invoice and payouts", () => {
  it("issues an invoice, records the bank transfer, then pays the professional", async () => {
    const { buyer, org, pro, booking: b } = await bookedSession("delta.in");
    const inv = await requestInvoice(buyer.id, org.id, b.id);
    expect(inv).toMatchObject({ status: "unpaid", totalPaise: 4_720_000 });
    expect(inv.dueAt).toBeTruthy();
    await expect(startOnlinePayment(buyer, org.id, b.id)).rejects.toMatchObject({ status: 400 });
    await expect(requestInvoice(buyer.id, org.id, b.id)).rejects.toMatchObject({ status: 400 });
    await processOutbox();
    expect(sentEmails.some((e) => e.to === buyer.email && e.subject === `Invoice ${inv.number} for ₹47,200.00`)).toBe(true);

    await expect(recordPayoutAsStaff(staff.id, b.id, { amountRupees: 1000, reference: "UTR0001", paidOn: "2027-01-01" })).rejects.toMatchObject({ status: 400 });
    await expect(markInvoicePaidAsStaff(staff.id, inv.id, "x")).rejects.toMatchObject({ status: 400 });
    await markInvoicePaidAsStaff(staff.id, inv.id, "UTR998877");
    await expect(markInvoicePaidAsStaff(staff.id, inv.id, "UTR998877")).rejects.toMatchObject({ status: 400 });
    const opts = await getPaymentOptions(buyer.id, org.id, b.id);
    expect(opts.status).toBe("paid");
    expect(opts.invoices).toHaveLength(1); // the same invoice, now paid
    expect(opts.invoices[0].status).toBe("paid");

    await expect(recordPayoutAsStaff(staff.id, b.id, { amountRupees: 36_000.01, reference: "UTR0002", paidOn: "2027-01-02" })).rejects.toMatchObject({ status: 400 });
    await recordPayoutAsStaff(staff.id, b.id, { amountRupees: 20_000, reference: "UTR0002", paidOn: "2027-01-02" });
    expect(summarizeEarnings(await listMyBookings(pro.user.id))).toMatchObject({ earnedPaise: 3_600_000, paidOutPaise: 2_000_000, duePaise: 1_600_000 });
    // The professional can see their payout but not the company's ledger.
    const seen = await withScope({ userId: pro.user.id }, async (tx) => ({ payouts: await tx.select().from(payout), ledger: await tx.select().from(ledgerEntry) }));
    expect(seen.payouts).toHaveLength(1);
    expect(seen.ledger).toHaveLength(0);
    // Payouts can't be edited: there is no update policy, and a trigger backs it up.
    await withScope({ userId: null, bypass: true }, (tx) => tx.update(payout).set({ amountPaise: 1 }));
    const [still] = await withScope({ userId: null, bypass: true }, (tx) => tx.select().from(payout).where(eq(payout.bookingId, b.id)));
    expect(still.amountPaise).toBe(2_000_000);
  });

  it("cancelling before an invoice is paid cancels it with a credit note", async () => {
    const { buyer, org, booking: b } = await bookedSession("epsilon.in");
    const inv = await requestInvoice(buyer.id, org.id, b.id);
    await cancelBooking(buyer.id, org.id, b.id, { reason: "No longer needed" });
    const opts = await getPaymentOptions(buyer.id, org.id, b.id);
    expect(opts.invoices.map((i) => [i.kind, i.status])).toEqual([["invoice", "cancelled"], ["credit_note", "issued"]]);
    expect(opts.invoices[1].number).toMatch(/^MSM-CN\//);
    await expect(markInvoicePaidAsStaff(staff.id, inv.id, "UTR12345")).rejects.toMatchObject({ status: 400 });
    expect(await ledgerFor(b.id)).toHaveLength(0);
  });

  it("other companies can't see invoices or payment details", async () => {
    const { buyer, org, booking: b } = await bookedSession("zeta.in");
    const inv = await requestInvoice(buyer.id, org.id, b.id);
    const other = { ...(await makeUser(db, "hr@eta.in")), emailVerified: true };
    const otherOrg = await createOrganization(other, { name: "Eta" });
    await expect(getOrgInvoice(other.id, otherOrg.id, inv.id)).rejects.toMatchObject({ status: 404 });
    await expect(getPaymentOptions(other.id, otherOrg.id, b.id)).rejects.toMatchObject({ status: 404 });
    await expect(getOrgInvoice(other.id, org.id, inv.id)).rejects.toMatchObject({ status: 403 });
    expect(await listOrgInvoices(other.id, otherOrg.id)).toHaveLength(0);
  });

  it("the whole ledger reconciles", async () => {
    const o = await financeOverview();
    expect(o.balanced).toBe(true);
    expect(o.paymentsMatchLedger).toBe(true);
    expect(o.mismatchedBookings).toEqual([]);
    // Without a scope, RLS hides every finance row.
    expect(await db.select().from(invoice)).toHaveLength(0);
    expect(await db.select().from(refund)).toHaveLength(0);
    expect(await db.select().from(payout)).toHaveLength(0);
    expect(await db.select().from(ledgerEntry)).toHaveLength(0);
    expect(o.collectedPaise).toBe(3 * 4_720_000);
    expect(o.outstandingPayablePaise).toBe(3_600_000 /* beta, late */ + 1_600_000 /* delta */);
    void booking;
  });
});

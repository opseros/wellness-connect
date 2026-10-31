// Payments, invoices, refunds and payouts for homestay stays (milestone M7).
//
// Money model (defaults; confirm with your CA before launch):
// - The platform sells the stay to the guest: room charges R plus GST on
//   accommodation by tariff per room per night (5% up to ₹7,500, 18% above,
//   as in force from 22 Sep 2025). Place of supply is where the property is.
// - The platform keeps a commission C (default 12% of R) and owes the host H = R − C.
// - Guests pay online (Razorpay). A host declining or cancelling refunds in
//   full; a guest cancelling is refunded by the stay's cancellation policy.
//
// Ledger (`stay_ledger_entry`) uses the same conventions as the session
// ledger in payments.ts, and the same reconciliation, always true to the paisa:
//   Σgross − Σrefund − Σreversal = Σtax + Σplatform_commission + Σprovider_payable
//   host outstanding = Σprovider_payable − Σsettlement
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  listing,
  organization,
  stay,
  stayInvoice,
  stayLedgerEntry,
  stayNight,
  stayPayment,
  stayPayout,
  stayRefund,
  user,
  type InvoiceLine,
  type InvoiceParty,
} from "@/db/schema";
import { withScope, type Executor, type Tx } from "@/db/client";
import { BRAND } from "@/lib/brand";
import { AppError, assertUuid, badRequest, conflict, notFound } from "@/lib/errors";
import { createOrder, createRefund, razorpayConfigured, razorpayKeyId, verifyPaymentSignature } from "@/lib/razorpay";
import { audit, enqueue } from "@/modules/platform/outbox";
import type { StayMoneySettings } from "@/modules/stays/policy";
import { getFinanceSettings, nextNumber, splitGst, STATE_NAMES } from "./payments";

export const STAY_UNAVAILABLE = "Stay no longer available";
export const STAY_DUPLICATE = "Duplicate payment";

export async function stayMoneySettings(db: Executor): Promise<StayMoneySettings & { sac: string }> {
  const s = await getFinanceSettings(db);
  return { commissionBps: s.stayCommissionBps, gstLowBps: s.stayGstLowBps, gstHighBps: s.stayGstHighBps, thresholdPaise: s.stayGstThresholdPaise, sac: s.staySacCode };
}

/** Listing state name → GST state code (falls back to the seller's state). */
function stateCode(name: string, fallback: string) {
  const n = name.trim().toLowerCase();
  return Object.entries(STATE_NAMES).find(([, v]) => v.toLowerCase() === n)?.[0] ?? fallback;
}

const day = (d: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

async function issueStayDocument(
  tx: Tx,
  input: {
    stayId: string;
    kind: "invoice" | "credit_note";
    status: "paid" | "issued";
    parts: { rateBps: number; taxablePaise: number; gstPaise: number }[];
    relatedInvoiceId?: string;
    paidAt?: Date;
    note?: string;
  },
) {
  const s = await getFinanceSettings(tx);
  const [row] = await tx
    .select({ stay, guestName: user.name, guestEmail: user.email, orgName: organization.name, state: listing.state, city: listing.city })
    .from(stay)
    .innerJoin(user, eq(user.id, stay.guestUserId))
    .innerJoin(organization, eq(organization.id, stay.orgId))
    .innerJoin(listing, eq(listing.orgId, stay.orgId))
    .where(eq(stay.id, input.stayId));
  if (!row) throw notFound("Stay not found");
  const st = row.stay;
  // Accommodation: the place of supply is the property's location (IGST Act s.12(3)).
  const pos = stateCode(row.state, s.sellerStateCode);
  const gstin = /^\d{2}[A-Z0-9]{13}$/.test(st.billingGstin) ? st.billingGstin : "";
  const seller: InvoiceParty = { name: s.sellerName || BRAND.name, gstin: s.sellerGstin, address: s.sellerAddress, stateCode: s.sellerStateCode };
  const buyer: InvoiceParty = { name: st.billingName || row.guestName, gstin, address: "", email: row.guestEmail, stateCode: gstin ? gstin.slice(0, 2) : pos };
  const desc = `${input.kind === "credit_note" ? "Refund: " : ""}Accommodation at ${row.orgName}, ${row.city}: ${st.rooms} room${st.rooms > 1 ? "s" : ""}, ${st.nights} night${st.nights > 1 ? "s" : ""} (${day(st.checkIn)} to ${day(st.checkOut)})${input.note ? ` (${input.note})` : ""}`;
  const lines: InvoiceLine[] = input.parts
    .filter((p) => p.taxablePaise > 0)
    .map((p) => ({ description: input.parts.length > 1 ? `${desc}, nights at ${p.rateBps / 100}% GST` : desc, sac: s.staySacCode, quantity: 1, taxablePaise: p.taxablePaise, gstRateBps: p.rateBps }));
  const taxable = input.parts.reduce((a, p) => a + p.taxablePaise, 0);
  const gst = input.parts.reduce((a, p) => a + p.gstPaise, 0);
  const now = new Date();
  const [doc] = await tx
    .insert(stayInvoice)
    .values({
      stayId: st.id,
      orgId: st.orgId,
      guestUserId: st.guestUserId,
      number: await nextNumber(tx, `${s.invoicePrefix}S`, input.kind, now),
      kind: input.kind,
      status: input.status,
      relatedInvoiceId: input.relatedInvoiceId,
      issuedAt: now,
      paidAt: input.paidAt,
      seller,
      buyer,
      lines,
      placeOfSupply: `${pos}${STATE_NAMES[pos] ? ` (${STATE_NAMES[pos]})` : ""}`,
      taxablePaise: taxable,
      ...splitGst(gst, s.sellerStateCode, pos),
      totalPaise: taxable + gst,
    })
    .returning();
  return doc;
}

type LedgerType = (typeof stayLedgerEntry.$inferInsert)["entryType"];
async function postStayLedger(
  tx: Tx,
  base: { stayId: string; orgId: string; guestUserId: string; paymentId?: string; refundId?: string; payoutId?: string },
  entries: { type: LedgerType; amount: number; memo: string }[],
) {
  const rows = entries.filter((e) => e.amount !== 0);
  if (rows.length) await tx.insert(stayLedgerEntry).values(rows.map((e) => ({ ...base, entryType: e.type, amountPaise: e.amount, memo: e.memo })));
}

/** Money taken that can't buy the stay any more: cash in and straight back out (gross + reversal, no GST or split). */
async function holdForRefund(tx: Tx, p: typeof stayPayment.$inferSelect, reason: string) {
  await postStayLedger(tx, { stayId: p.stayId, orgId: p.orgId, guestUserId: p.guestUserId, paymentId: p.id }, [
    { type: "gross", amount: p.amountPaise, memo: `Payment ${p.providerPaymentId}` },
    { type: "reversal", amount: p.amountPaise, memo: `${reason}: to be refunded` },
  ]);
  await createStayRefund(tx, { stayId: p.stayId, paymentId: p.id, amountPaise: p.amountPaise, reason, createdBy: null });
}

/**
 * The single place a stay becomes paid and confirmed: invoice, ledger, holds
 * made permanent, emails. Callers lock the payment row first.
 */
async function settleStayPaid(tx: Tx, paymentId: string, paidAt: Date) {
  const [p] = await tx.select().from(stayPayment).where(eq(stayPayment.id, paymentId));
  const [st] = await tx.select().from(stay).where(eq(stay.id, p.stayId)).for("update");
  if (st.paymentStatus !== "unpaid") {
    await holdForRefund(tx, p, STAY_DUPLICATE);
    return { status: "duplicate_refunded" as const };
  }
  if (st.status !== "accepted") {
    // Paid after the offer expired or the stay was cancelled/declined: give it all back.
    await holdForRefund(tx, p, STAY_UNAVAILABLE);
    return { status: "refunded_unavailable" as const };
  }
  const inv = await issueStayDocument(tx, { stayId: st.id, kind: "invoice", status: "paid", parts: st.gstParts, paidAt });
  await tx.update(stayPayment).set({ invoiceId: inv.id }).where(eq(stayPayment.id, p.id));
  await postStayLedger(tx, { stayId: st.id, orgId: st.orgId, guestUserId: st.guestUserId, paymentId: p.id }, [
    { type: "gross", amount: st.totalPaise, memo: `Payment ${p.providerPaymentId}` },
    { type: "tax", amount: st.gstPaise, memo: `GST on invoice ${inv.number}` },
    { type: "platform_commission", amount: st.commissionPaise, memo: "Platform commission" },
    { type: "provider_payable", amount: st.payablePaise, memo: "Due to host" },
  ]);
  await tx.update(stay).set({ status: "confirmed", paymentStatus: "paid", paidAt, updatedAt: new Date() }).where(eq(stay.id, st.id));
  await tx.update(stayNight).set({ holdUntil: null }).where(eq(stayNight.stayId, st.id));
  await tx
    .update(stayPayment)
    .set({ status: "cancelled", failureReason: "Stay already paid", updatedAt: new Date() })
    .where(and(eq(stayPayment.stayId, st.id), ne(stayPayment.id, p.id), eq(stayPayment.status, "pending")));
  await enqueue(tx, { type: "stay.confirmed", payload: { stayId: st.id, orgId: st.orgId, guestUserId: st.guestUserId, invoiceId: inv.id } });
  return { status: "paid" as const, invoiceId: inv.id };
}

/** Online payment captured (checkout callback or webhook). Idempotent per order. Called with the payment row's scope or bypass. */
export async function recordStayOnlinePaid(tx: Tx, input: { orderId: string; paymentId: string; amountPaise?: number; method?: string }) {
  const [p] = await tx.select().from(stayPayment).where(eq(stayPayment.providerOrderId, input.orderId)).for("update");
  if (!p) return { status: "unknown_order" as const };
  if (p.status !== "pending" && p.status !== "failed" && p.status !== "cancelled") return { status: "already_paid" as const, paymentId: p.id };
  if (input.amountPaise != null && input.amountPaise !== p.amountPaise) {
    await tx.update(stayPayment).set({ failureReason: `Amount mismatch: expected ${p.amountPaise}, got ${input.amountPaise}`, updatedAt: new Date() }).where(eq(stayPayment.id, p.id));
    await audit(tx, { actorId: null, action: "stay_payment.amount_mismatch", targetType: "stay_payment", targetId: p.id, metadata: input });
    return { status: "amount_mismatch" as const };
  }
  const now = new Date();
  await tx
    .update(stayPayment)
    .set({ status: "paid", providerPaymentId: input.paymentId, method: input.method ?? null, paidAt: now, failureReason: null, updatedAt: now })
    .where(eq(stayPayment.id, p.id));
  const r = await settleStayPaid(tx, p.id, now);
  return { ...r, paymentId: p.id };
}

/** Razorpay Checkout for an accepted stay; guests only, before the pay-by time. */
export async function startStayPayment(actor: { id: string; name: string; email: string }, stayId: string) {
  assertUuid(stayId, "Stay");
  if (!razorpayConfigured()) throw badRequest("Online payment isn't available yet. Please try again later.");
  const st = await withScope({ userId: actor.id }, async (tx) => {
    const own = await tx.query.stay.findFirst({ where: and(eq(stay.id, stayId), eq(stay.guestUserId, actor.id)) });
    if (!own) throw notFound("Stay not found");
    if (own.paymentStatus !== "unpaid") throw conflict("This stay is already paid");
    if (own.status !== "accepted") throw badRequest("This stay can't be paid for: the host hasn't accepted it, or it was cancelled");
    if (own.payBy && own.payBy.getTime() < Date.now()) throw badRequest("The time to pay has passed. Send a new request.");
    return own;
  });
  const existing = await withScope({ userId: actor.id }, (tx) =>
    tx.query.stayPayment.findFirst({ where: and(eq(stayPayment.stayId, st.id), eq(stayPayment.status, "pending"), eq(stayPayment.amountPaise, st.totalPaise)) }),
  );
  let orderId = existing?.providerOrderId ?? null;
  if (!orderId) {
    const order = await createOrder({ amountPaise: st.totalPaise, receipt: `st_${st.id.slice(0, 30)}`, notes: { stayId: st.id } }).catch((e) => {
      console.error(e);
      throw new AppError(502, "payment_provider", "We couldn't reach the payment provider. Try again in a minute.");
    });
    orderId = order.id;
    await withScope({ userId: actor.id }, (tx) =>
      tx.insert(stayPayment).values({ stayId: st.id, orgId: st.orgId, guestUserId: actor.id, providerOrderId: order.id, amountPaise: st.totalPaise, idempotencyKey: `rzp-order-${order.id}` }),
    );
  }
  return { keyId: razorpayKeyId(), orderId, amountPaise: st.totalPaise, currency: "INR", prefill: { name: actor.name, email: actor.email } };
}

export const stayCheckoutInput = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(256),
});

/** Checkout's success callback. The signature proves Razorpay took this payment for this order. */
export async function confirmStayCheckout(userId: string, input: z.input<typeof stayCheckoutInput>) {
  const d = stayCheckoutInput.parse(input);
  if (!verifyPaymentSignature(d.razorpay_order_id, d.razorpay_payment_id, d.razorpay_signature)) {
    throw badRequest("We couldn't verify this payment. If money was taken, it will be confirmed automatically.");
  }
  return withScope({ userId }, async (tx) => {
    const p = await tx.query.stayPayment.findFirst({ where: and(eq(stayPayment.providerOrderId, d.razorpay_order_id), eq(stayPayment.guestUserId, userId)) });
    if (!p) throw notFound("Payment not found");
    return recordStayOnlinePaid(tx, { orderId: d.razorpay_order_id, paymentId: d.razorpay_payment_id });
  });
}

/** Creates a refund for a paid stay (sent to Razorpay by the outbox). Called inside the cancelling transaction. */
export async function createStayRefund(tx: Tx, input: { stayId: string; paymentId?: string; amountPaise: number; reason: string; createdBy: string | null }) {
  const p = input.paymentId
    ? await tx.query.stayPayment.findFirst({ where: eq(stayPayment.id, input.paymentId) })
    : await tx.query.stayPayment.findFirst({ where: and(eq(stayPayment.stayId, input.stayId), inArray(stayPayment.status, ["paid", "partially_refunded"])) });
  if (!p) throw notFound("No payment to refund");
  const [r] = await tx
    .insert(stayRefund)
    .values({ stayId: input.stayId, orgId: p.orgId, guestUserId: p.guestUserId, paymentId: p.id, amountPaise: input.amountPaise, reason: input.reason, createdBy: input.createdBy })
    .returning();
  await enqueue(tx, { type: "stay_refund.requested", payload: { refundId: r.id } });
  await audit(tx, { actorId: input.createdBy, action: "stay_refund.create", targetType: "stay_refund", targetId: r.id, metadata: { amountPaise: r.amountPaise } });
  return r;
}

/** Shares of a refund, proportional to the stay's price; parts always add up to the refund exactly. */
export function splitStayRefund(st: Pick<typeof stay.$inferSelect, "totalPaise" | "commissionPaise" | "gstParts">, amountPaise: number) {
  if (amountPaise <= 0 || amountPaise > st.totalPaise) throw new Error("Invalid refund amount");
  const parts = st.gstParts.map((p) => {
    const gstPaise = Math.round((p.gstPaise * amountPaise) / st.totalPaise);
    const taxablePaise = Math.round((p.taxablePaise * amountPaise) / st.totalPaise);
    return { rateBps: p.rateBps, taxablePaise, gstPaise };
  });
  const gstPaise = parts.reduce((a, p) => a + p.gstPaise, 0);
  // Keep the credit note's total equal to the refund: rounding goes to the last line's taxable value.
  const drift = amountPaise - gstPaise - parts.reduce((a, p) => a + p.taxablePaise, 0);
  parts[parts.length - 1].taxablePaise += drift;
  const commissionPaise = Math.round((st.commissionPaise * amountPaise) / st.totalPaise);
  return { parts, gstPaise, commissionPaise, payablePaise: amountPaise - gstPaise - commissionPaise };
}

/** Refund confirmed by Razorpay: ledger, credit note, statuses. Idempotent. */
export async function markStayRefundProcessed(tx: Tx, refundId: string, details: { providerRefundId?: string } = {}) {
  const [r] = await tx.select().from(stayRefund).where(eq(stayRefund.id, refundId)).for("update");
  if (!r) throw notFound("Refund not found");
  if (r.status === "processed") return { changed: false as const };
  const base = { stayId: r.stayId, orgId: r.orgId, guestUserId: r.guestUserId, paymentId: r.paymentId, refundId: r.id };
  const now = new Date();
  if (r.reason === STAY_UNAVAILABLE || r.reason === STAY_DUPLICATE) {
    await postStayLedger(tx, base, [
      { type: "refund", amount: r.amountPaise, memo: `Refund ${details.providerRefundId ?? r.id}` },
      { type: "reversal", amount: -r.amountPaise, memo: `${r.reason}: hold released` },
    ]);
    await tx.update(stayPayment).set({ status: "refunded", updatedAt: now }).where(eq(stayPayment.id, r.paymentId));
    await tx.update(stayRefund).set({ status: "processed", processedAt: now, ...(details.providerRefundId ? { providerRefundId: details.providerRefundId } : {}) }).where(eq(stayRefund.id, r.id));
    await enqueue(tx, { type: "stay_refund.processed", payload: { refundId: r.id, stayId: r.stayId, guestUserId: r.guestUserId, amountPaise: r.amountPaise } });
    return { changed: true as const };
  }
  const [st] = await tx.select().from(stay).where(eq(stay.id, r.stayId)).for("update");
  const split = splitStayRefund(st, r.amountPaise);
  const p = await tx.query.stayPayment.findFirst({ where: eq(stayPayment.id, r.paymentId) });
  const credit = await issueStayDocument(tx, { stayId: st.id, kind: "credit_note", status: "issued", parts: split.parts, relatedInvoiceId: p?.invoiceId ?? undefined, note: r.reason || undefined });
  await postStayLedger(tx, base, [
    { type: "refund", amount: r.amountPaise, memo: `Refund ${details.providerRefundId ?? r.id}` },
    { type: "tax", amount: -split.gstPaise, memo: `GST reversed, credit note ${credit.number}` },
    { type: "platform_commission", amount: -split.commissionPaise, memo: "Commission reversed" },
    { type: "provider_payable", amount: -split.payablePaise, memo: "Host's share reversed" },
  ]);
  const refunded = st.refundedPaise + r.amountPaise;
  const full = refunded >= st.totalPaise;
  await tx
    .update(stay)
    .set({ refundedPaise: refunded, payableReversedPaise: st.payableReversedPaise + split.payablePaise, paymentStatus: full ? "refunded" : "partially_refunded", updatedAt: now })
    .where(eq(stay.id, st.id));
  await tx.update(stayPayment).set({ status: full ? "refunded" : "partially_refunded", updatedAt: now }).where(eq(stayPayment.id, r.paymentId));
  await tx
    .update(stayRefund)
    .set({ status: "processed", processedAt: now, creditNoteId: credit.id, ...(details.providerRefundId ? { providerRefundId: details.providerRefundId } : {}) })
    .where(eq(stayRefund.id, r.id));
  await enqueue(tx, { type: "stay_refund.processed", payload: { refundId: r.id, stayId: st.id, guestUserId: st.guestUserId, amountPaise: r.amountPaise } });
  return { changed: true as const };
}

/** Outbox handler for stay_refund.requested: asks Razorpay to refund (idempotent by our refund id). */
export async function sendStayRefundToRazorpay(tx: Tx, refundId: string) {
  const r = await tx.query.stayRefund.findFirst({ where: eq(stayRefund.id, refundId) });
  if (!r || r.status !== "pending") return;
  const p = await tx.query.stayPayment.findFirst({ where: eq(stayPayment.id, r.paymentId) });
  if (!p?.providerPaymentId) throw new Error("Payment has no Razorpay id yet");
  const res = await createRefund({ paymentId: p.providerPaymentId, amountPaise: r.amountPaise, refundId: r.id });
  await tx.update(stayRefund).set({ providerRefundId: res.id }).where(eq(stayRefund.id, r.id));
  if (res.status === "processed") await markStayRefundProcessed(tx, r.id, { providerRefundId: res.id });
}

/** Webhook fallbacks (called from handleRazorpayWebhook with bypass when no session payment matches). */
export async function stayWebhookRefundProcessed(tx: Tx, ref: { id: string; notes?: Record<string, string> }) {
  const r = await tx.query.stayRefund.findFirst({ where: ref.notes?.refundId ? eq(stayRefund.id, ref.notes.refundId) : eq(stayRefund.providerRefundId, ref.id) });
  return r ? markStayRefundProcessed(tx, r.id, { providerRefundId: ref.id }) : null;
}
export async function stayWebhookRefundFailed(tx: Tx, providerRefundId: string) {
  await tx.update(stayRefund).set({ status: "failed", failureReason: "Razorpay reported the refund failed" }).where(and(eq(stayRefund.providerRefundId, providerRefundId), eq(stayRefund.status, "pending")));
}
export async function stayWebhookPaymentFailed(tx: Tx, orderId: string, reason: string) {
  await tx.update(stayPayment).set({ failureReason: reason, updatedAt: new Date() }).where(and(eq(stayPayment.providerOrderId, orderId), eq(stayPayment.status, "pending")));
}

/** The guest's money view of a stay: payments, documents and refunds. */
export async function stayMoneyForGuest(tx: Tx, stayId: string) {
  const invoices = await tx.select().from(stayInvoice).where(eq(stayInvoice.stayId, stayId)).orderBy(asc(stayInvoice.issuedAt));
  const refunds = await tx.select().from(stayRefund).where(eq(stayRefund.stayId, stayId)).orderBy(asc(stayRefund.createdAt));
  return { invoices, refunds, online: razorpayConfigured() };
}

/** A stay invoice or credit note for its guest (or the host's team, or staff). */
export async function getStayInvoice(scope: { userId: string; orgId?: string | null; bypass?: boolean }, invoiceId: string) {
  assertUuid(invoiceId, "Invoice");
  return withScope({ userId: scope.userId, orgId: scope.orgId ?? null, bypass: scope.bypass }, async (tx) => {
    const inv = await tx.query.stayInvoice.findFirst({ where: eq(stayInvoice.id, invoiceId) });
    if (!inv) throw notFound("Invoice not found");
    const related = inv.relatedInvoiceId ? await tx.query.stayInvoice.findFirst({ where: eq(stayInvoice.id, inv.relatedInvoiceId) }) : null;
    return { invoice: inv, relatedNumber: related?.number ?? null };
  });
}

// ---------- Platform staff (called from the admin module) ----------

export const stayPayoutInput = z.object({
  amountRupees: z.number().positive("Enter the amount paid"),
  reference: z.string().trim().min(4, "Enter the bank reference (UTR)").max(100),
  paidOn: z.string().date("Choose the payment date"),
});

/** Record money sent to the host for a stay. Allowed once the guest has checked in. */
export async function recordStayPayoutAsStaff(staffId: string, stayId: string, input: z.input<typeof stayPayoutInput>) {
  const d = stayPayoutInput.parse(input);
  assertUuid(stayId, "Stay");
  const amount = Math.round(d.amountRupees * 100);
  return withScope({ userId: staffId, bypass: true }, async (tx) => {
    const [st] = await tx.select().from(stay).where(eq(stay.id, stayId)).for("update");
    if (!st) throw notFound("Stay not found");
    if (st.paymentStatus === "unpaid") throw badRequest("The guest hasn't paid for this stay");
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (st.checkIn > today && st.status !== "cancelled") throw badRequest("Hosts are paid after check-in");
    const [{ paid }] = await tx.select({ paid: sql<number>`coalesce(sum(${stayPayout.amountPaise}), 0)::int` }).from(stayPayout).where(eq(stayPayout.stayId, st.id));
    const outstanding = st.payablePaise - st.payableReversedPaise - paid;
    if (amount > outstanding) throw badRequest(`Only ₹${(outstanding / 100).toLocaleString("en-IN")} is due to the host for this stay`);
    const [row] = await tx
      .insert(stayPayout)
      .values({ stayId: st.id, orgId: st.orgId, amountPaise: amount, reference: d.reference, paidAt: new Date(`${d.paidOn}T12:00:00+05:30`), recordedBy: staffId })
      .returning();
    await postStayLedger(tx, { stayId: st.id, orgId: st.orgId, guestUserId: st.guestUserId, payoutId: row.id }, [{ type: "settlement", amount, memo: `Payout ${d.reference}` }]);
    await audit(tx, { actorId: staffId, action: "stay_payout.record", targetType: "stay_payout", targetId: row.id, metadata: { stayId: st.id, amountPaise: amount } });
    await enqueue(tx, { type: "stay_payout.recorded", payload: { payoutId: row.id, orgId: st.orgId, amountPaise: amount } });
    return row;
  });
}

/** Stay totals and per-stay checks for the admin finance page. Every diff must be 0. */
export async function stayFinanceOverview() {
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const totals = await tx
      .select({ type: stayLedgerEntry.entryType, sum: sql<number>`coalesce(sum(${stayLedgerEntry.amountPaise}), 0)::bigint` })
      .from(stayLedgerEntry)
      .groupBy(stayLedgerEntry.entryType);
    const t = Object.fromEntries(totals.map((r) => [r.type, Number(r.sum)])) as Record<string, number>;
    const v = (k: string) => t[k] ?? 0;
    const per = await tx.execute<{ stay_id: string; diff: string }>(sql`
      select stay_id,
        sum(case when entry_type = 'gross' then amount_paise when entry_type in ('refund', 'reversal', 'tax', 'platform_commission', 'provider_payable') then -amount_paise else 0 end) as diff
      from stay_ledger_entry group by stay_id
      having sum(case when entry_type = 'gross' then amount_paise when entry_type in ('refund', 'reversal', 'tax', 'platform_commission', 'provider_payable') then -amount_paise else 0 end) <> 0`);
    const mismatches = (Array.isArray(per) ? per : per.rows) as { stay_id: string; diff: string }[];
    const [paidSum] = await tx
      .select({ sum: sql<number>`coalesce(sum(${stayPayment.amountPaise}), 0)::bigint` })
      .from(stayPayment)
      .where(inArray(stayPayment.status, ["paid", "partially_refunded", "refunded"]));
    return {
      collectedPaise: v("gross"),
      refundedPaise: v("refund"),
      gstPaise: v("tax"),
      commissionPaise: v("platform_commission"),
      payablePaise: v("provider_payable"),
      paidOutPaise: v("settlement"),
      outstandingPayablePaise: v("provider_payable") - v("settlement"),
      balanced: v("gross") - v("refund") - v("reversal") === v("tax") + v("platform_commission") + v("provider_payable"),
      paymentsMatchLedger: Number(paidSum.sum) === v("gross"),
      mismatchedStays: mismatches.map((m) => ({ stayId: m.stay_id, diffPaise: Number(m.diff) })),
    };
  });
}

/** Work queues: refunds that failed, and hosts owed money after check-in. */
export async function listStayFinanceQueues() {
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const refunds = await tx
      .select({ refund: stayRefund, hostName: organization.name })
      .from(stayRefund)
      .innerJoin(organization, eq(organization.id, stayRefund.orgId))
      .where(inArray(stayRefund.status, ["pending", "failed"]))
      .orderBy(asc(stayRefund.createdAt));
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const rows = await tx
      .select({
        stay,
        hostName: organization.name,
        guestName: user.name,
        paidOut: sql<number>`(select coalesce(sum(p.amount_paise), 0)::int from ${stayPayout} p where p.stay_id = ${stay.id})`,
      })
      .from(stay)
      .innerJoin(organization, eq(organization.id, stay.orgId))
      .innerJoin(user, eq(user.id, stay.guestUserId))
      .where(and(inArray(stay.paymentStatus, ["paid", "partially_refunded", "refunded"]), sql`${stay.checkIn} <= ${today}`))
      .orderBy(asc(stay.checkIn));
    const recent = await tx
      .select({ payment: stayPayment, hostName: organization.name })
      .from(stayPayment)
      .innerJoin(organization, eq(organization.id, stayPayment.orgId))
      .orderBy(desc(stayPayment.createdAt))
      .limit(20);
    return {
      refunds,
      payables: rows.map((r) => ({ ...r, outstandingPaise: r.stay.payablePaise - r.stay.payableReversedPaise - r.paidOut })).filter((r) => r.outstandingPaise > 0),
      recentPayments: recent,
    };
  });
}

/** Failed stay refunds need staff attention. */
export async function stayFinanceAttentionCount() {
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(stayRefund).where(eq(stayRefund.status, "failed"));
    return r.n;
  });
}

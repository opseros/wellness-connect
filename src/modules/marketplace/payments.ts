// Payments, invoices, refunds and payouts (milestone M4).
//
// Money model (decided with the founder; confirm with your CA before launch):
// - The platform sells the session to the company: the company pays the
//   session fee F plus GST on F (default 18%). One tax invoice per booking.
// - The platform keeps a commission C (default 10% of F, per category
//   override) and owes the professional P = F − C.
//
// Ledger conventions (all integer paise, append-only):
//   gross               + amount collected from the company
//   refund              + amount returned to the company
//   tax / platform_commission / provider_payable
//                       + when a payment is received, − for the refunded share
//   settlement          + amount paid out to the professional
// Reconciliation, always true to the paisa:
//   Σgross − Σrefund = Σtax + Σplatform_commission + Σprovider_payable
//   professional outstanding = Σprovider_payable − Σsettlement
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  booking,
  category,
  financeSettings,
  invoice,
  ledgerEntry,
  organization,
  payment,
  payout,
  proposal,
  refund,
  requirement,
  user,
  webhookEvent,
  type InvoiceLine,
  type InvoiceParty,
} from "@/db/schema";
import { withScope, type Executor, type Tx } from "@/db/client";
import { AppError, assertUuid, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { createOrder, createRefund, razorpayConfigured, razorpayKeyId, verifyPaymentSignature, verifyWebhookSignature } from "@/lib/razorpay";
import { audit, enqueue } from "@/modules/platform/outbox";
import { ORG_BUYERS, requireOrgRole } from "@/modules/organizations/service";

const DAY = 86_400_000;

// ---------- Pure calculations (unit-tested) ----------

export type Price = { feePaise: number; gstPaise: number; totalPaise: number; commissionPaise: number; payablePaise: number };

export function priceBooking(feePaise: number, commissionBps: number, gstBps: number): Price {
  const gstPaise = Math.round((feePaise * gstBps) / 10_000);
  const commissionPaise = Math.round((feePaise * commissionBps) / 10_000);
  return { feePaise, gstPaise, totalPaise: feePaise + gstPaise, commissionPaise, payablePaise: feePaise - commissionPaise };
}

/**
 * How a refund of `amount` is taken back from tax, commission and the
 * professional's share. The payable part is the remainder, so the three
 * parts always add up to the refund exactly.
 */
export function splitRefund(p: Pick<Price, "totalPaise" | "gstPaise" | "commissionPaise">, amountPaise: number) {
  if (amountPaise <= 0 || amountPaise > p.totalPaise) throw new Error("Invalid refund amount");
  const gstPaise = Math.round((p.gstPaise * amountPaise) / p.totalPaise);
  const commissionPaise = Math.round((p.commissionPaise * amountPaise) / p.totalPaise);
  return { gstPaise, commissionPaise, payablePaise: amountPaise - gstPaise - commissionPaise };
}

/** Same state → CGST + SGST; different state → IGST. */
export function splitGst(gstPaise: number, sellerState: string, buyerState: string) {
  if (sellerState === buyerState) {
    const cgst = Math.floor(gstPaise / 2);
    return { cgstPaise: cgst, sgstPaise: gstPaise - cgst, igstPaise: 0 };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise };
}

/** Indian financial year (April–March) for a date, in India time: "2026-27". */
export function financialYear(d: Date) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

// ---------- Settings ----------

export async function getFinanceSettings(db: Executor) {
  const row = await db.query.financeSettings.findFirst({ where: eq(financeSettings.id, "default") });
  if (row) return row;
  const [created] = await db.insert(financeSettings).values({ id: "default" }).onConflictDoNothing().returning();
  return created ?? (await db.query.financeSettings.findFirst({ where: eq(financeSettings.id, "default") }))!;
}

// ---------- Internals ----------

/** Fixes the price of a booking the first time it is needed; later setting changes don't move it. */
export async function ensureQuote(tx: Tx, bookingId: string) {
  const [b] = await tx.select().from(booking).where(eq(booking.id, bookingId)).for("update");
  if (!b) throw notFound("Booking not found");
  if (b.totalPaise != null) return b;
  const [row] = await tx
    .select({ fee: proposal.feePaise, categoryBps: category.commissionBps })
    .from(proposal)
    .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
    .innerJoin(category, eq(category.id, requirement.categoryId))
    .where(eq(proposal.id, b.proposalId));
  const s = await getFinanceSettings(tx);
  const p = priceBooking(row.fee, row.categoryBps ?? s.commissionBps, s.gstBps);
  const [updated] = await tx.update(booking).set(p).where(eq(booking.id, b.id)).returning();
  return updated;
}

async function nextNumber(tx: Tx, prefix: string, kind: "invoice" | "credit_note", at: Date) {
  const series = `${prefix}${kind === "credit_note" ? "-CN" : ""}/${financialYear(at)}`;
  const rows = await tx.execute<{ n: number }>(sql`
    insert into invoice_counter (series, next) values (${series}, 2)
    on conflict (series) do update set next = invoice_counter.next + 1
    returning next - 1 as n`);
  const n = Number(((Array.isArray(rows) ? rows : rows.rows) as { n: number }[])[0].n);
  return `${series}/${String(n).padStart(4, "0")}`;
}

async function bookingContext(tx: Tx, bookingId: string) {
  const [row] = await tx
    .select({ booking, title: requirement.title, proName: user.name, org: organization })
    .from(booking)
    .innerJoin(proposal, eq(proposal.id, booking.proposalId))
    .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
    .innerJoin(user, eq(user.id, booking.professionalUserId))
    .innerJoin(organization, eq(organization.id, booking.orgId))
    .where(eq(booking.id, bookingId));
  if (!row) throw notFound("Booking not found");
  return row;
}

async function issueDocument(
  tx: Tx,
  input: { bookingId: string; kind: "invoice" | "credit_note"; status: "unpaid" | "paid" | "issued"; taxablePaise: number; gstPaise: number; relatedInvoiceId?: string; dueAt?: Date; paidAt?: Date; note?: string },
) {
  const s = await getFinanceSettings(tx);
  const { booking: b, title, proName, org } = await bookingContext(tx, input.bookingId);
  const buyerState = /^\d{2}/.test(org.gstin) ? org.gstin.slice(0, 2) : s.sellerStateCode;
  const seller: InvoiceParty = { name: s.sellerName || "Moosam", gstin: s.sellerGstin, address: s.sellerAddress, stateCode: s.sellerStateCode };
  const buyer: InvoiceParty = { name: org.name, gstin: org.gstin, address: [org.address, org.city].filter(Boolean).join(", "), email: org.billingEmail || undefined, stateCode: buyerState };
  const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(b.scheduledStart);
  const lines: InvoiceLine[] = [
    {
      description: `${input.kind === "credit_note" ? "Refund: " : ""}Wellness session "${title}" with ${proName}, ${when}${input.note ? ` (${input.note})` : ""}`,
      sac: s.sacCode,
      quantity: 1,
      taxablePaise: input.taxablePaise,
      gstRateBps: s.gstBps,
    },
  ];
  const now = new Date();
  const [doc] = await tx
    .insert(invoice)
    .values({
      orgId: b.orgId,
      bookingId: b.id,
      number: await nextNumber(tx, s.invoicePrefix, input.kind, now),
      kind: input.kind,
      status: input.status,
      relatedInvoiceId: input.relatedInvoiceId,
      issuedAt: now,
      dueAt: input.dueAt,
      paidAt: input.paidAt,
      seller,
      buyer,
      lines,
      placeOfSupply: `${buyerState}${STATE_NAMES[buyerState] ? ` (${STATE_NAMES[buyerState]})` : ""}`,
      taxablePaise: input.taxablePaise,
      ...splitGst(input.gstPaise, s.sellerStateCode, buyerState),
      totalPaise: input.taxablePaise + input.gstPaise,
    })
    .returning();
  return doc;
}

async function postLedger(tx: Tx, base: { bookingId: string; orgId: string; paymentId?: string; refundId?: string; payoutId?: string }, entries: { type: (typeof ledgerEntry.$inferInsert)["entryType"]; amount: number; memo: string }[]) {
  const rows = entries.filter((e) => e.amount !== 0);
  if (rows.length) await tx.insert(ledgerEntry).values(rows.map((e) => ({ ...base, entryType: e.type, amountPaise: e.amount, memo: e.memo })));
}

/**
 * The single place a booking becomes paid: invoice, ledger, booking status and
 * emails. Callers lock the payment row first; this is never run twice for a payment.
 */
async function settleBookingPaid(tx: Tx, paymentId: string, paidAt: Date) {
  const [p] = await tx.select().from(payment).where(eq(payment.id, paymentId));
  const b = await ensureQuote(tx, p.bookingId);
  // Pay-by-invoice reuses its invoice; online payments get a new, already-paid one.
  let inv = p.invoiceId ? await tx.query.invoice.findFirst({ where: eq(invoice.id, p.invoiceId) }) : undefined;
  if (inv) {
    await tx.update(invoice).set({ status: "paid", paidAt }).where(eq(invoice.id, inv.id));
  } else {
    inv = await issueDocument(tx, { bookingId: b.id, kind: "invoice", status: "paid", taxablePaise: b.feePaise!, gstPaise: b.gstPaise!, paidAt });
    await tx.update(payment).set({ invoiceId: inv.id }).where(eq(payment.id, p.id));
  }
  await postLedger(tx, { bookingId: b.id, orgId: b.orgId, paymentId: p.id }, [
    { type: "gross", amount: b.totalPaise!, memo: `Payment ${p.provider === "razorpay" ? p.providerPaymentId : (p.reference ?? "bank transfer")}` },
    { type: "tax", amount: b.gstPaise!, memo: `GST on invoice ${inv.number}` },
    { type: "platform_commission", amount: b.commissionPaise!, memo: "Platform commission" },
    { type: "provider_payable", amount: b.payablePaise!, memo: "Due to professional" },
  ]);
  await tx
    .update(booking)
    .set({ paymentStatus: "paid", paidAt, ...(b.status === "pending" ? { status: "confirmed" as const } : {}) })
    .where(eq(booking.id, b.id));
  // Any other open checkout attempts for this booking are now moot.
  await tx
    .update(payment)
    .set({ status: "cancelled", failureReason: "Booking already paid", updatedAt: new Date() })
    .where(and(eq(payment.bookingId, b.id), ne(payment.id, p.id), eq(payment.status, "pending")));
  await enqueue(tx, { type: "payment.received", payload: { bookingId: b.id, orgId: b.orgId, invoiceId: inv.id, professionalUserId: b.professionalUserId } });

  // Paid after the company had already cancelled: refund per the policy straight away.
  if (b.status === "cancelled") {
    const s = await getFinanceSettings(tx);
    const amount = b.cancelledLate ? Math.round((b.totalPaise! * s.lateCancelRefundBps) / 10_000) : b.totalPaise!;
    if (amount > 0) await createRefundRecord(tx, { bookingId: b.id, paymentId: p.id, amountPaise: amount, reason: "Booking was cancelled", createdBy: null });
  }
  return inv;
}

async function createRefundRecord(tx: Tx, input: { bookingId: string; paymentId: string; amountPaise: number; reason: string; createdBy: string | null }) {
  const p = await tx.query.payment.findFirst({ where: eq(payment.id, input.paymentId) });
  if (!p) throw notFound("Payment not found");
  const [r] = await tx
    .insert(refund)
    .values({
      orgId: p.orgId,
      bookingId: input.bookingId,
      paymentId: p.id,
      amountPaise: input.amountPaise,
      provider: p.provider === "razorpay" ? "razorpay" : "manual",
      reason: input.reason,
      createdBy: input.createdBy,
    })
    .returning();
  // Online refunds are sent to Razorpay by the outbox worker (retried on failure);
  // bank-transfer refunds wait for staff to record them.
  if (r.provider === "razorpay") await enqueue(tx, { type: "refund.requested", payload: { refundId: r.id } });
  await audit(tx, { actorId: input.createdBy, action: "refund.create", targetType: "refund", targetId: r.id, metadata: { amountPaise: r.amountPaise, provider: r.provider } });
  return r;
}

/** Refund done (Razorpay confirmed it, or staff sent the bank transfer): ledger, credit note, statuses. */
async function markRefundProcessed(tx: Tx, refundId: string, details: { providerRefundId?: string; reference?: string } = {}) {
  const [r] = await tx.select().from(refund).where(eq(refund.id, refundId)).for("update");
  if (!r) throw notFound("Refund not found");
  if (r.status === "processed") return { changed: false as const, refund: r };
  if (r.reason === DUPLICATE) {
    await postLedger(tx, { bookingId: r.bookingId, orgId: r.orgId, paymentId: r.paymentId, refundId: r.id }, [
      { type: "refund", amount: r.amountPaise, memo: `Duplicate payment refunded ${details.providerRefundId ?? details.reference ?? ""}`.trim() },
      { type: "reversal", amount: -r.amountPaise, memo: "Duplicate payment hold released" },
    ]);
    await tx.update(payment).set({ status: "refunded", updatedAt: new Date() }).where(eq(payment.id, r.paymentId));
    const [done] = await tx
      .update(refund)
      .set({ status: "processed", processedAt: new Date(), ...(details.providerRefundId ? { providerRefundId: details.providerRefundId } : {}), ...(details.reference ? { reference: details.reference } : {}) })
      .where(eq(refund.id, r.id))
      .returning();
    return { changed: true as const, refund: done };
  }
  const [b] = await tx.select().from(booking).where(eq(booking.id, r.bookingId)).for("update");
  const part = splitRefund({ totalPaise: b.totalPaise!, gstPaise: b.gstPaise!, commissionPaise: b.commissionPaise! }, r.amountPaise);
  const p = await tx.query.payment.findFirst({ where: eq(payment.id, r.paymentId) });
  const credit = await issueDocument(tx, {
    bookingId: b.id,
    kind: "credit_note",
    status: "issued",
    taxablePaise: r.amountPaise - part.gstPaise,
    gstPaise: part.gstPaise,
    relatedInvoiceId: p?.invoiceId ?? undefined,
    note: r.reason || undefined,
  });
  await postLedger(tx, { bookingId: b.id, orgId: b.orgId, paymentId: r.paymentId, refundId: r.id }, [
    { type: "refund", amount: r.amountPaise, memo: `Refund ${details.providerRefundId ?? details.reference ?? r.id}` },
    { type: "tax", amount: -part.gstPaise, memo: `GST reversed, credit note ${credit.number}` },
    { type: "platform_commission", amount: -part.commissionPaise, memo: "Commission reversed" },
    { type: "provider_payable", amount: -part.payablePaise, memo: "Professional's share reversed" },
  ]);
  const refunded = b.refundedPaise + r.amountPaise;
  const full = refunded >= b.totalPaise!;
  await tx
    .update(booking)
    .set({ refundedPaise: refunded, payableReversedPaise: b.payableReversedPaise + part.payablePaise, paymentStatus: full ? "refunded" : "partially_refunded" })
    .where(eq(booking.id, b.id));
  if (p) await tx.update(payment).set({ status: full ? "refunded" : "partially_refunded", updatedAt: new Date() }).where(eq(payment.id, p.id));
  const [done] = await tx
    .update(refund)
    .set({ status: "processed", processedAt: new Date(), creditNoteId: credit.id, ...(details.providerRefundId ? { providerRefundId: details.providerRefundId } : {}), ...(details.reference ? { reference: details.reference } : {}) })
    .where(eq(refund.id, r.id))
    .returning();
  await enqueue(tx, { type: "refund.processed", payload: { refundId: r.id, bookingId: b.id, orgId: b.orgId, amountPaise: r.amountPaise } });
  return { changed: true as const, refund: done };
}

async function lockPaymentByOrder(tx: Tx, orderId: string) {
  const [p] = await tx.select().from(payment).where(eq(payment.providerOrderId, orderId)).for("update");
  return p;
}

/** Online payment captured (checkout callback or webhook). Idempotent per order. */
async function recordOnlinePaid(tx: Tx, input: { orderId: string; paymentId: string; amountPaise?: number; method?: string }) {
  const p = await lockPaymentByOrder(tx, input.orderId);
  if (!p) return { status: "unknown_order" as const };
  if (p.status !== "pending" && p.status !== "authorized" && p.status !== "failed" && p.status !== "cancelled") return { status: "already_paid" as const, paymentId: p.id };
  if (input.amountPaise != null && input.amountPaise !== p.amountPaise) {
    await tx.update(payment).set({ failureReason: `Amount mismatch: expected ${p.amountPaise}, got ${input.amountPaise}`, updatedAt: new Date() }).where(eq(payment.id, p.id));
    await audit(tx, { actorId: null, action: "payment.amount_mismatch", targetType: "payment", targetId: p.id, metadata: input });
    return { status: "amount_mismatch" as const };
  }
  // A late capture for a booking that's already paid another way: refund it in full.
  const b = await tx.query.booking.findFirst({ where: eq(booking.id, p.bookingId) });
  const now = new Date();
  await tx
    .update(payment)
    .set({ status: "paid", providerPaymentId: input.paymentId, method: input.method ?? null, paidAt: now, failureReason: null, updatedAt: now })
    .where(eq(payment.id, p.id));
  if (b && b.paymentStatus !== "unpaid" && b.paymentStatus !== "invoiced") {
    await createRefundRecord(tx, { bookingId: b.id, paymentId: p.id, amountPaise: p.amountPaise, reason: DUPLICATE, createdBy: null });
    await postDuplicatePaymentLedger(tx, p.id);
    return { status: "duplicate_refunded" as const, paymentId: p.id };
  }
  await settleBookingPaid(tx, p.id, now);
  return { status: "paid" as const, paymentId: p.id };
}

const DUPLICATE = "Duplicate payment";

/**
 * A second capture for an already-paid booking is cash in and straight back
 * out: gross + a "reversal" held for the customer, with no GST, commission or
 * payable. Its refund later books refund + −reversal, so it nets to zero.
 */
async function postDuplicatePaymentLedger(tx: Tx, paymentId: string) {
  const p = await tx.query.payment.findFirst({ where: eq(payment.id, paymentId) });
  if (!p) return;
  await postLedger(tx, { bookingId: p.bookingId, orgId: p.orgId, paymentId: p.id }, [{ type: "gross", amount: p.amountPaise, memo: `Duplicate payment ${p.providerPaymentId}` }, { type: "reversal", amount: p.amountPaise, memo: "Duplicate payment to be refunded" }]);
}

// ---------- Company-facing ----------

export type PaymentOptions = {
  price: Price;
  status: (typeof booking.$inferSelect)["paymentStatus"];
  online: boolean;
  invoices: (typeof invoice.$inferSelect)[];
  refunds: (typeof refund.$inferSelect)[];
  bankDetails: string;
  commissionBps: number;
  gstBps: number;
};

/** What the booking page shows: price breakdown, documents, refunds and which ways to pay. */
export async function getPaymentOptions(userId: string, orgId: string, bookingId: string): Promise<PaymentOptions> {
  assertUuid(bookingId, "Booking");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const existing = await tx.query.booking.findFirst({ where: and(eq(booking.id, bookingId), eq(booking.orgId, orgId)) });
    if (!existing) throw notFound("Booking not found");
    const b = existing.status === "cancelled" && existing.totalPaise == null ? existing : await ensureQuote(tx, bookingId);
    const s = await getFinanceSettings(tx);
    const invoices = await tx.select().from(invoice).where(eq(invoice.bookingId, b.id)).orderBy(asc(invoice.issuedAt));
    const refunds = await tx.select().from(refund).where(eq(refund.bookingId, b.id)).orderBy(asc(refund.createdAt));
    const price: Price = b.totalPaise != null
      ? { feePaise: b.feePaise!, gstPaise: b.gstPaise!, totalPaise: b.totalPaise, commissionPaise: b.commissionPaise!, payablePaise: b.payablePaise! }
      : priceBooking(0, 0, 0);
    return { price, status: b.paymentStatus, online: razorpayConfigured(), invoices, refunds, bankDetails: s.bankDetails, commissionBps: s.commissionBps, gstBps: s.gstBps };
  });
}

function assertPayable(b: typeof booking.$inferSelect) {
  if (b.status === "cancelled") throw badRequest("This booking was cancelled");
  if (b.paymentStatus === "invoiced") throw badRequest("An invoice has been issued for this booking. Pay it by bank transfer.");
  if (b.paymentStatus !== "unpaid") throw conflict("This booking is already paid");
}

/** Creates (or reuses) a Razorpay order and returns what Checkout needs. */
export async function startOnlinePayment(actor: { id: string; name: string; email: string }, orgId: string, bookingId: string) {
  assertUuid(bookingId, "Booking");
  if (!razorpayConfigured()) throw badRequest("Online payment isn't available yet. Choose pay by invoice.");
  const b = await withScope({ userId: actor.id, orgId }, async (tx) => {
    await requireOrgRole(actor.id, orgId, ORG_BUYERS, tx);
    const own = await tx.query.booking.findFirst({ where: and(eq(booking.id, bookingId), eq(booking.orgId, orgId)) });
    if (!own) throw notFound("Booking not found");
    const q = await ensureQuote(tx, bookingId);
    assertPayable(q);
    return q;
  });
  const existing = await withScope({ userId: actor.id, orgId }, (tx) =>
    tx.query.payment.findFirst({ where: and(eq(payment.bookingId, b.id), eq(payment.provider, "razorpay"), eq(payment.status, "pending"), eq(payment.amountPaise, b.totalPaise!)) }),
  );
  let orderId = existing?.providerOrderId ?? null;
  if (!orderId) {
    // Network call outside any transaction; the order id is recorded right after.
    const order = await createOrder({ amountPaise: b.totalPaise!, receipt: `bk_${b.id.slice(0, 30)}`, notes: { bookingId: b.id, orgId } }).catch((e) => {
      console.error(e);
      throw new AppError(502, "payment_provider", "We couldn't reach the payment provider. Try again in a minute, or pay by invoice.");
    });
    orderId = order.id;
    await withScope({ userId: actor.id, orgId }, (tx) =>
      tx.insert(payment).values({ bookingId: b.id, orgId, provider: "razorpay", providerOrderId: order.id, amountPaise: b.totalPaise!, idempotencyKey: `rzp-order-${order.id}` }),
    );
  }
  return { keyId: razorpayKeyId(), orderId, amountPaise: b.totalPaise!, currency: "INR", prefill: { name: actor.name, email: actor.email } };
}

export const checkoutResultInput = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(256),
});

/** Checkout's success callback. The signature proves Razorpay took this payment for this order. */
export async function confirmCheckout(userId: string, orgId: string, input: z.input<typeof checkoutResultInput>) {
  const d = checkoutResultInput.parse(input);
  if (!verifyPaymentSignature(d.razorpay_order_id, d.razorpay_payment_id, d.razorpay_signature)) throw badRequest("We couldn't verify this payment. If money was taken, it will be confirmed automatically.");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const p = await tx.query.payment.findFirst({ where: and(eq(payment.providerOrderId, d.razorpay_order_id), eq(payment.orgId, orgId)) });
    if (!p) throw notFound("Payment not found");
    return recordOnlinePaid(tx, { orderId: d.razorpay_order_id, paymentId: d.razorpay_payment_id });
  });
}

/** Pay by invoice (allowed during the pilot): issue the tax invoice now, payment by bank transfer. */
export async function requestInvoice(userId: string, orgId: string, bookingId: string) {
  assertUuid(bookingId, "Booking");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const own = await tx.query.booking.findFirst({ where: and(eq(booking.id, bookingId), eq(booking.orgId, orgId)) });
    if (!own) throw notFound("Booking not found");
    const b = await ensureQuote(tx, bookingId);
    assertPayable(b);
    const s = await getFinanceSettings(tx);
    const dueAt = new Date(Math.min(Date.now() + s.paymentTermsDays * DAY, Math.max(b.scheduledStart.getTime() - DAY, Date.now() + DAY)));
    const inv = await issueDocument(tx, { bookingId: b.id, kind: "invoice", status: "unpaid", taxablePaise: b.feePaise!, gstPaise: b.gstPaise!, dueAt });
    await tx.insert(payment).values({ bookingId: b.id, orgId, provider: "invoice", amountPaise: b.totalPaise!, invoiceId: inv.id, idempotencyKey: `invoice-${inv.id}` });
    await tx.update(booking).set({ paymentStatus: "invoiced", ...(b.status === "pending" ? { status: "confirmed" as const } : {}) }).where(eq(booking.id, b.id));
    await audit(tx, { actorId: userId, action: "invoice.issue", targetType: "invoice", targetId: inv.id });
    await enqueue(tx, { type: "invoice.issued", payload: { invoiceId: inv.id, orgId, bookingId: b.id, requestedBy: userId } });
    return inv;
  });
}

/**
 * Called by cancelBooking in the same transaction. Applies the refund policy:
 * a free cancellation refunds everything; inside the window the configured
 * share (default none). An unpaid invoice is cancelled with a credit note.
 */
export async function onBookingCancelled(tx: Tx, bookingId: string, late: boolean, actorId: string) {
  const b = await ensureQuote(tx, bookingId);
  const s = await getFinanceSettings(tx);
  await tx
    .update(payment)
    .set({ status: "cancelled", failureReason: "Booking cancelled", updatedAt: new Date() })
    .where(and(eq(payment.bookingId, b.id), eq(payment.provider, "razorpay"), eq(payment.status, "pending")));
  if (b.paymentStatus === "invoiced" && !late) {
    const inv = await tx.query.invoice.findFirst({ where: and(eq(invoice.bookingId, b.id), eq(invoice.kind, "invoice"), eq(invoice.status, "unpaid")) });
    if (inv) {
      await issueDocument(tx, { bookingId: b.id, kind: "credit_note", status: "issued", taxablePaise: inv.taxablePaise, gstPaise: inv.totalPaise - inv.taxablePaise, relatedInvoiceId: inv.id, note: "Booking cancelled" });
      await tx.update(invoice).set({ status: "cancelled" }).where(eq(invoice.id, inv.id));
      await tx.update(payment).set({ status: "cancelled", failureReason: "Booking cancelled", updatedAt: new Date() }).where(and(eq(payment.invoiceId, inv.id), eq(payment.status, "pending")));
      await tx.update(booking).set({ paymentStatus: "unpaid" }).where(eq(booking.id, b.id));
    }
    return { refundPaise: 0 };
  }
  // A late cancellation of an unpaid invoice stays due; any refund share is applied when it's paid.
  if (b.paymentStatus !== "paid") return { refundPaise: 0 };
  const amount = late ? Math.round((b.totalPaise! * s.lateCancelRefundBps) / 10_000) : b.totalPaise!;
  if (amount <= 0) return { refundPaise: 0 };
  const p = await tx.query.payment.findFirst({ where: and(eq(payment.bookingId, b.id), eq(payment.status, "paid")) });
  if (!p) return { refundPaise: 0 };
  await createRefundRecord(tx, { bookingId: b.id, paymentId: p.id, amountPaise: amount, reason: late ? "Late cancellation" : "Cancelled within the free-cancellation window", createdBy: actorId });
  return { refundPaise: amount };
}

/** The refund amount a cancellation right now would produce, for the cancel form. */
export async function previewCancellationRefund(tx: Tx, bookingId: string, late: boolean) {
  const b = await tx.query.booking.findFirst({ where: eq(booking.id, bookingId) });
  if (!b || b.paymentStatus !== "paid" || b.totalPaise == null) return 0;
  const s = await getFinanceSettings(tx);
  return late ? Math.round((b.totalPaise * s.lateCancelRefundBps) / 10_000) : b.totalPaise;
}

export async function listOrgInvoices(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    return tx
      .select({ invoice, title: requirement.title })
      .from(invoice)
      .innerJoin(booking, eq(booking.id, invoice.bookingId))
      .innerJoin(proposal, eq(proposal.id, booking.proposalId))
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .where(eq(invoice.orgId, orgId))
      .orderBy(desc(invoice.issuedAt));
  });
}

export async function getOrgInvoice(userId: string, orgId: string, invoiceId: string) {
  assertUuid(invoiceId, "Invoice");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const inv = await tx.query.invoice.findFirst({ where: and(eq(invoice.id, invoiceId), eq(invoice.orgId, orgId)) });
    if (!inv) throw notFound("Invoice not found");
    const related = inv.relatedInvoiceId ? await tx.query.invoice.findFirst({ where: eq(invoice.id, inv.relatedInvoiceId) }) : null;
    const s = await getFinanceSettings(tx);
    return { invoice: inv, relatedNumber: related?.number ?? null, bankDetails: s.bankDetails };
  });
}

// ---------- Razorpay webhooks ----------

type RzpEvent = {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; amount: number; method?: string; error_description?: string } };
    order?: { entity: { id: string } };
    refund?: { entity: { id: string; payment_id: string; amount: number; status: string; notes?: Record<string, string> } };
  };
};

/**
 * Verified, idempotent webhook handling. The event id is stored in the same
 * transaction as its effects, so a replay is a no-op and a failure is retried.
 */
export async function handleRazorpayWebhook(rawBody: string, signature: string, eventId: string) {
  if (!verifyWebhookSignature(rawBody, signature)) throw forbidden("Invalid signature");
  const evt = JSON.parse(rawBody) as RzpEvent;
  const id = eventId || `body-${createHash("sha256").update(rawBody).digest("hex")}`;
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const fresh = await tx.insert(webhookEvent).values({ id, provider: "razorpay", type: evt.event }).onConflictDoNothing().returning();
    if (!fresh.length) return { duplicate: true as const };
    const pay = evt.payload.payment?.entity;
    const ref = evt.payload.refund?.entity;
    switch (evt.event) {
      case "payment.captured":
      case "order.paid":
        if (pay) return { duplicate: false as const, result: await recordOnlinePaid(tx, { orderId: pay.order_id, paymentId: pay.id, amountPaise: pay.amount, method: pay.method }) };
        break;
      case "payment.failed":
        if (pay) {
          await tx
            .update(payment)
            .set({ failureReason: pay.error_description ?? "Payment failed", updatedAt: new Date() })
            .where(and(eq(payment.providerOrderId, pay.order_id), eq(payment.status, "pending")));
        }
        break;
      case "refund.processed": {
        if (!ref) break;
        const r = await tx.query.refund.findFirst({ where: ref.notes?.refundId ? eq(refund.id, ref.notes.refundId) : eq(refund.providerRefundId, ref.id) });
        if (r) return { duplicate: false as const, result: await markRefundProcessed(tx, r.id, { providerRefundId: ref.id }) };
        break;
      }
      case "refund.failed": {
        if (!ref) break;
        await tx.update(refund).set({ status: "failed", failureReason: "Razorpay reported the refund failed" }).where(and(eq(refund.providerRefundId, ref.id), eq(refund.status, "pending")));
        break;
      }
    }
    return { duplicate: false as const };
  });
}

/** Outbox handler for refund.requested: asks Razorpay to refund (idempotent by our refund id). */
export async function sendRefundToRazorpay(tx: Tx, refundId: string) {
  const r = await tx.query.refund.findFirst({ where: eq(refund.id, refundId) });
  if (!r || r.status !== "pending" || r.provider !== "razorpay") return;
  const p = await tx.query.payment.findFirst({ where: eq(payment.id, r.paymentId) });
  if (!p?.providerPaymentId) throw new Error("Payment has no Razorpay id yet");
  const res = await createRefund({ paymentId: p.providerPaymentId, amountPaise: r.amountPaise, refundId: r.id });
  await tx.update(refund).set({ providerRefundId: res.id }).where(eq(refund.id, r.id));
  if (res.status === "processed") await markRefundProcessed(tx, r.id, { providerRefundId: res.id });
}

// ---------- Platform staff (called from the admin module) ----------

/** Bank transfer received for an invoice. */
export async function markInvoicePaidAsStaff(staffId: string, invoiceId: string, reference: string) {
  assertUuid(invoiceId, "Invoice");
  if (reference.trim().length < 4) throw badRequest("Enter the bank reference (UTR) for this payment");
  return withScope({ userId: staffId, bypass: true }, async (tx) => {
    const [inv] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId)).for("update");
    if (!inv || inv.kind !== "invoice") throw notFound("Invoice not found");
    if (inv.status !== "unpaid") throw badRequest(`This invoice is ${inv.status}`);
    const [p] = await tx.select().from(payment).where(and(eq(payment.invoiceId, inv.id), eq(payment.provider, "invoice"))).for("update");
    if (!p || p.status !== "pending") throw badRequest("No open payment for this invoice");
    const now = new Date();
    await tx.update(payment).set({ status: "paid", method: "bank_transfer", reference: reference.trim(), paidAt: now, updatedAt: now }).where(eq(payment.id, p.id));
    await settleBookingPaid(tx, p.id, now);
    await audit(tx, { actorId: staffId, action: "invoice.mark_paid", targetType: "invoice", targetId: inv.id, metadata: { reference: reference.trim() } });
  });
}

/** Manual (bank transfer) refund sent; or retry/confirm a stuck Razorpay refund. */
export async function markRefundProcessedAsStaff(staffId: string, refundId: string, reference: string) {
  assertUuid(refundId, "Refund");
  return withScope({ userId: staffId, bypass: true }, async (tx) => {
    const r = await tx.query.refund.findFirst({ where: eq(refund.id, refundId) });
    if (!r) throw notFound("Refund not found");
    if (r.provider === "razorpay") throw badRequest("Online refunds are confirmed by Razorpay automatically");
    if (reference.trim().length < 4) throw badRequest("Enter the bank reference (UTR) for this refund");
    const res = await markRefundProcessed(tx, r.id, { reference: reference.trim() });
    await audit(tx, { actorId: staffId, action: "refund.mark_processed", targetType: "refund", targetId: r.id, metadata: { reference: reference.trim() } });
    return res;
  });
}

export const payoutInput = z.object({
  amountRupees: z.number().positive("Enter the amount paid"),
  reference: z.string().trim().min(4, "Enter the bank reference (UTR)").max(100),
  paidOn: z.string().date("Choose the payment date"),
});

/** Record money sent to a professional for a booking (manual payouts during the pilot). */
export async function recordPayoutAsStaff(staffId: string, bookingId: string, input: z.input<typeof payoutInput>) {
  const d = payoutInput.parse(input);
  assertUuid(bookingId, "Booking");
  const amount = Math.round(d.amountRupees * 100);
  return withScope({ userId: staffId, bypass: true }, async (tx) => {
    const [b] = await tx.select().from(booking).where(eq(booking.id, bookingId)).for("update");
    if (!b) throw notFound("Booking not found");
    if (b.paymentStatus !== "paid" && b.paymentStatus !== "partially_refunded" && b.paymentStatus !== "refunded") throw badRequest("The company hasn't paid for this booking yet");
    const [{ paid }] = await tx.select({ paid: sql<number>`coalesce(sum(${payout.amountPaise}), 0)::int` }).from(payout).where(eq(payout.bookingId, b.id));
    const outstanding = (b.payablePaise ?? 0) - b.payableReversedPaise - paid;
    if (amount > outstanding) throw badRequest(`Only ₹${(outstanding / 100).toLocaleString("en-IN")} is due to the professional for this booking`);
    const [row] = await tx
      .insert(payout)
      .values({ orgId: b.orgId, bookingId: b.id, professionalUserId: b.professionalUserId, amountPaise: amount, reference: d.reference, paidAt: new Date(`${d.paidOn}T12:00:00+05:30`), recordedBy: staffId })
      .returning();
    await postLedger(tx, { bookingId: b.id, orgId: b.orgId, payoutId: row.id }, [{ type: "settlement", amount, memo: `Payout ${d.reference}` }]);
    await audit(tx, { actorId: staffId, action: "payout.record", targetType: "payout", targetId: row.id, metadata: { bookingId: b.id, amountPaise: amount } });
    await enqueue(tx, { type: "payout.recorded", payload: { payoutId: row.id, professionalUserId: b.professionalUserId, amountPaise: amount } });
    return row;
  });
}

/** Totals and per-booking checks for the admin finance page. Every diff must be 0. */
export async function financeOverview() {
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const totals = await tx
      .select({ type: ledgerEntry.entryType, sum: sql<number>`coalesce(sum(${ledgerEntry.amountPaise}), 0)::bigint` })
      .from(ledgerEntry)
      .groupBy(ledgerEntry.entryType);
    const t = Object.fromEntries(totals.map((r) => [r.type, Number(r.sum)])) as Record<string, number>;
    const v = (k: string) => t[k] ?? 0;
    const perBooking = await tx.execute<{ booking_id: string; diff: string }>(sql`
      select booking_id,
        sum(case when entry_type = 'gross' then amount_paise when entry_type in ('refund', 'reversal') then -amount_paise
                 when entry_type in ('tax', 'platform_commission', 'provider_payable') then -amount_paise else 0 end) as diff
      from ledger_entry group by booking_id
      having sum(case when entry_type = 'gross' then amount_paise when entry_type in ('refund', 'reversal') then -amount_paise
                 when entry_type in ('tax', 'platform_commission', 'provider_payable') then -amount_paise else 0 end) <> 0`);
    const mismatches = (Array.isArray(perBooking) ? perBooking : perBooking.rows) as { booking_id: string; diff: string }[];
    const [paidSum] = await tx
      .select({ sum: sql<number>`coalesce(sum(${payment.amountPaise}), 0)::bigint` })
      .from(payment)
      .where(inArray(payment.status, ["paid", "partially_refunded", "refunded"]));
    return {
      collectedPaise: v("gross"),
      refundedPaise: v("refund"),
      gstPaise: v("tax"),
      commissionPaise: v("platform_commission"),
      payablePaise: v("provider_payable"),
      paidOutPaise: v("settlement"),
      outstandingPayablePaise: v("provider_payable") - v("settlement"),
      // Collected = refunded + duplicates held + GST + commission + professionals' share.
      balanced: v("gross") - v("refund") - v("reversal") === v("tax") + v("platform_commission") + v("provider_payable"),
      paymentsMatchLedger: Number(paidSum.sum) === v("gross"),
      mismatchedBookings: mismatches.map((m) => ({ bookingId: m.booking_id, diffPaise: Number(m.diff) })),
    };
  });
}

/** Work queues for the admin finance page. */
export async function listFinanceQueues() {
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const unpaidInvoices = await tx
      .select({ invoice, orgName: organization.name })
      .from(invoice)
      .innerJoin(organization, eq(organization.id, invoice.orgId))
      .where(and(eq(invoice.kind, "invoice"), eq(invoice.status, "unpaid")))
      .orderBy(asc(invoice.dueAt));
    const refunds = await tx
      .select({ refund, orgName: organization.name })
      .from(refund)
      .innerJoin(organization, eq(organization.id, refund.orgId))
      .where(inArray(refund.status, ["pending", "failed"]))
      .orderBy(asc(refund.createdAt));
    const payables = await tx
      .select({
        booking,
        title: requirement.title,
        orgName: organization.name,
        proName: user.name,
        proEmail: user.email,
        paidOut: sql<number>`(select coalesce(sum(p.amount_paise), 0)::int from ${payout} p where p.booking_id = ${booking.id})`,
      })
      .from(booking)
      .innerJoin(proposal, eq(proposal.id, booking.proposalId))
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .innerJoin(organization, eq(organization.id, booking.orgId))
      .innerJoin(user, eq(user.id, booking.professionalUserId))
      .where(inArray(booking.paymentStatus, ["paid", "partially_refunded", "refunded"]))
      .orderBy(asc(booking.scheduledStart));
    const recentPayments = await tx
      .select({ payment, orgName: organization.name })
      .from(payment)
      .innerJoin(organization, eq(organization.id, payment.orgId))
      .orderBy(desc(payment.createdAt))
      .limit(30);
    return {
      unpaidInvoices,
      refunds,
      payables: payables
        .map((p) => ({ ...p, outstandingPaise: (p.booking.payablePaise ?? 0) - p.booking.payableReversedPaise - p.paidOut }))
        .filter((p) => p.outstandingPaise > 0),
      recentPayments,
    };
  });
}

export async function getInvoiceAsStaff(invoiceId: string) {
  assertUuid(invoiceId, "Invoice");
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const inv = await tx.query.invoice.findFirst({ where: eq(invoice.id, invoiceId) });
    if (!inv) throw notFound("Invoice not found");
    const related = inv.relatedInvoiceId ? await tx.query.invoice.findFirst({ where: eq(invoice.id, inv.relatedInvoiceId) }) : null;
    const s = await getFinanceSettings(tx);
    return { invoice: inv, relatedNumber: related?.number ?? null, bankDetails: s.bankDetails };
  });
}

export const financeSettingsInput = z.object({
  commissionPercent: z.number().min(0).max(50),
  gstPercent: z.number().min(0).max(28),
  lateCancelRefundPercent: z.number().min(0).max(100),
  paymentTermsDays: z.number().int().min(0).max(60),
  sellerName: z.string().trim().min(2, "Enter the legal name on invoices").max(200),
  sellerGstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5"),
  sellerAddress: z.string().trim().max(400),
  sellerStateCode: z.string().refine((v) => v in STATE_NAMES, "Choose a state"),
  sacCode: z.string().trim().regex(/^\d{4,8}$/, "SAC is 4 to 8 digits"),
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9]{2,8}$/, "Use 2–8 capital letters or digits"),
  bankDetails: z.string().trim().max(600),
});

/** Super admins only (checked by the admin module). Applies to bookings priced from now on. */
export async function updateFinanceSettings(staffId: string, input: z.input<typeof financeSettingsInput>) {
  const d = financeSettingsInput.parse(input);
  return withScope({ userId: staffId, bypass: true }, async (tx) => {
    const before = await getFinanceSettings(tx);
    if (d.sellerGstin && d.sellerGstin.slice(0, 2) !== d.sellerStateCode) throw badRequest("The GSTIN's first two digits must match the state");
    const [row] = await tx
      .update(financeSettings)
      .set({
        commissionBps: Math.round(d.commissionPercent * 100),
        gstBps: Math.round(d.gstPercent * 100),
        lateCancelRefundBps: Math.round(d.lateCancelRefundPercent * 100),
        paymentTermsDays: d.paymentTermsDays,
        sellerName: d.sellerName,
        sellerGstin: d.sellerGstin,
        sellerAddress: d.sellerAddress,
        sellerStateCode: d.sellerStateCode,
        sacCode: d.sacCode,
        invoicePrefix: d.invoicePrefix,
        bankDetails: d.bankDetails,
        updatedAt: new Date(),
      })
      .where(eq(financeSettings.id, "default"))
      .returning();
    await audit(tx, { actorId: staffId, action: "finance.settings", targetType: "finance_settings", targetId: "default", metadata: { before: { commissionBps: before.commissionBps, gstBps: before.gstBps, lateCancelRefundBps: before.lateCancelRefundBps }, after: { commissionBps: row.commissionBps, gstBps: row.gstBps, lateCancelRefundBps: row.lateCancelRefundBps } } });
    return row;
  });
}

export async function readFinanceSettings() {
  return withScope({ userId: null, bypass: true }, (tx) => getFinanceSettings(tx));
}

/** Items waiting for staff: refunds to send by bank and refunds that failed. */
export async function financeAttentionCount() {
  return withScope({ userId: null, bypass: true }, async (tx) => {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(refund)
      .where(sql`(${refund.provider} = 'manual' and ${refund.status} = 'pending') or ${refund.status} = 'failed'`);
    return r.n;
  });
}

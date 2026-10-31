import { pgTable, uuid, text, timestamp, integer, boolean, date, jsonb, bigint, index, primaryKey } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organizations";
import type { InvoiceLine, InvoiceParty } from "./marketplace";

/**
 * Homestay stays (M7). A guest (any signed-in member) requests dates, the host
 * accepts, the guest pays online, the platform issues the GST invoice, keeps a
 * commission and owes the host the rest. Money mirrors the session marketplace
 * (see src/modules/marketplace/stay-payments.ts) but lives in its own tables:
 * the payer is a person, not a company.
 */

export const STAY_PURPOSES = ["care", "rest", "retreat"] as const;
export const ACCESS_NEEDS = ["step_free", "ground_floor", "special_diet", "caregiver"] as const;
export const STAY_STATUSES = ["requested", "accepted", "confirmed", "declined", "expired", "cancelled", "completed"] as const;
export type StayStatus = (typeof STAY_STATUSES)[number];

export type NightPrice = { date: string; pricePaise: number };
export type GstPart = { rateBps: number; taxablePaise: number; gstPaise: number };

/** Host's per-date price overrides and blocked dates. Public information (prices are shown to guests). */
export const stayCalendar = pgTable(
  "stay_calendar",
  {
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    pricePaise: integer("price_paise"),
    blocked: boolean("blocked").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.day] })],
);

export const stay = pgTable(
  "stay",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    guestUserId: uuid("guest_user_id").notNull().references(() => user.id),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    rooms: integer("rooms").notNull().default(1),
    guests: integer("guests").notNull().default(1),
    purpose: text("purpose", { enum: STAY_PURPOSES }).notNull(),
    accessNeeds: text("access_needs").array().notNull().default([]),
    message: text("message").notNull().default(""),
    billingName: text("billing_name").notNull().default(""),
    billingGstin: text("billing_gstin").notNull().default(""),
    status: text("status", { enum: STAY_STATUSES }).notNull().default("requested"),
    respondBy: timestamp("respond_by", { withTimezone: true }).notNull(),
    payBy: timestamp("pay_by", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    hostNote: text("host_note"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => user.id),
    cancelledByHost: boolean("cancelled_by_host").notNull().default(false),
    cancelReason: text("cancel_reason"),
    // Price snapshot (integer paise), fixed at request time.
    nightly: jsonb("nightly").$type<NightPrice[]>().notNull(),
    gstParts: jsonb("gst_parts").$type<GstPart[]>().notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    gstPaise: integer("gst_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    commissionPaise: integer("commission_paise").notNull(),
    payablePaise: integer("payable_paise").notNull(),
    cancellationPolicy: text("cancellation_policy").notNull(),
    paymentStatus: text("payment_status", { enum: ["unpaid", "paid", "partially_refunded", "refunded"] }).notNull().default("unpaid"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedPaise: integer("refunded_paise").notNull().default(0),
    payableReversedPaise: integer("payable_reversed_paise").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stay_org_idx").on(t.orgId, t.checkIn), index("stay_guest_idx").on(t.guestUserId)],
);

/**
 * Rooms held per night. Accepted-but-unpaid stays hold until `hold_until`;
 * confirmed stays hold for good (null). Counts only, no personal data, so the
 * availability check can see every guest's holds without reading `stay`.
 */
export const stayNight = pgTable(
  "stay_night",
  {
    stayId: uuid("stay_id").notNull().references(() => stay.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    day: date("day").notNull(),
    rooms: integer("rooms").notNull(),
    holdUntil: timestamp("hold_until", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.stayId, t.day] }), index("stay_night_org_day_idx").on(t.orgId, t.day)],
);

export const stayPayment = pgTable(
  "stay_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stayId: uuid("stay_id").notNull().references(() => stay.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    guestUserId: uuid("guest_user_id").notNull().references(() => user.id),
    providerOrderId: text("provider_order_id").unique(),
    providerPaymentId: text("provider_payment_id").unique(),
    method: text("method"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status", { enum: ["pending", "paid", "failed", "cancelled", "partially_refunded", "refunded"] }).notNull().default("pending"),
    failureReason: text("failure_reason"),
    invoiceId: uuid("invoice_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stay_payment_stay_idx").on(t.stayId)],
);

/** Tax invoices and credit notes for stays. Numbered in their own series (prefix + "S"). */
export const stayInvoice = pgTable(
  "stay_invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stayId: uuid("stay_id").notNull().references(() => stay.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    guestUserId: uuid("guest_user_id").notNull().references(() => user.id),
    number: text("number").notNull().unique(),
    kind: text("kind", { enum: ["invoice", "credit_note"] }).notNull().default("invoice"),
    status: text("status", { enum: ["unpaid", "paid", "cancelled", "issued"] }).notNull(),
    relatedInvoiceId: uuid("related_invoice_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    seller: jsonb("seller").$type<InvoiceParty>().notNull(),
    buyer: jsonb("buyer").$type<InvoiceParty>().notNull(),
    lines: jsonb("lines").$type<InvoiceLine[]>().notNull(),
    placeOfSupply: text("place_of_supply").notNull(),
    taxablePaise: integer("taxable_paise").notNull(),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
  },
  (t) => [index("stay_invoice_stay_idx").on(t.stayId)],
);

export const stayRefund = pgTable(
  "stay_refund",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stayId: uuid("stay_id").notNull().references(() => stay.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    guestUserId: uuid("guest_user_id").notNull().references(() => user.id),
    paymentId: uuid("payment_id").notNull().references(() => stayPayment.id),
    amountPaise: integer("amount_paise").notNull(),
    providerRefundId: text("provider_refund_id").unique(),
    status: text("status", { enum: ["pending", "processed", "failed"] }).notNull().default("pending"),
    reason: text("reason").notNull().default(""),
    failureReason: text("failure_reason"),
    creditNoteId: uuid("credit_note_id"),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("stay_refund_stay_idx").on(t.stayId)],
);

/** Money sent to the host for a stay. Recorded by staff; immutable. */
export const stayPayout = pgTable(
  "stay_payout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stayId: uuid("stay_id").notNull().references(() => stay.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    amountPaise: integer("amount_paise").notNull(),
    reference: text("reference").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    recordedBy: uuid("recorded_by").notNull().references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stay_payout_stay_idx").on(t.stayId)],
);

/**
 * Append-only stay ledger, same sign conventions as `ledger_entry`:
 * Σgross − Σrefund − Σreversal = Σtax + Σplatform_commission + Σprovider_payable.
 */
export const stayLedgerEntry = pgTable(
  "stay_ledger_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stayId: uuid("stay_id").notNull().references(() => stay.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    guestUserId: uuid("guest_user_id").notNull().references(() => user.id),
    paymentId: uuid("payment_id").references(() => stayPayment.id),
    refundId: uuid("refund_id").references(() => stayRefund.id),
    payoutId: uuid("payout_id").references(() => stayPayout.id),
    entryType: text("entry_type", { enum: ["gross", "tax", "platform_commission", "provider_payable", "refund", "settlement", "reversal"] }).notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    memo: text("memo").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stay_ledger_stay_idx").on(t.stayId)],
);

// Marketplace, bookings and finance. Tenant-owned rows carry org_id and are
// protected by Postgres row-level security (see drizzle/0001_rls.sql).
import { pgTable, uuid, text, timestamp, integer, boolean, date, bigint, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organizations";
import { category, DELIVERY_MODES } from "./professionals";

export const requirement = pgTable(
  "requirement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => user.id),
    title: text("title").notNull(),
    categoryId: uuid("category_id").notNull().references(() => category.id),
    city: text("city").notNull().default(""),
    deliveryMode: text("delivery_mode", { enum: DELIVERY_MODES }).notNull(),
    participants: integer("participants").notNull(),
    budgetMinPaise: integer("budget_min_paise").notNull(),
    budgetMaxPaise: integer("budget_max_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    preferredDate: date("preferred_date"),
    // Must-haves are hard filters in matching; a high score never overrides them.
    mustBeVerified: boolean("must_be_verified").notNull().default(true),
    mustLanguages: text("must_languages").array().notNull().default([]),
    minYearsExperience: integer("min_years_experience").notNull().default(0),
    details: text("details").notNull().default(""),
    status: text("status", { enum: ["draft", "published", "closed", "withdrawn"] }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("requirement_org_idx").on(t.orgId)],
);

export const enquiry = pgTable(
  "enquiry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id").notNull().references(() => requirement.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    professionalUserId: uuid("professional_user_id").notNull().references(() => user.id),
    status: text("status", { enum: ["sent", "viewed", "responded", "declined", "closed"] }).notNull().default("sent"),
    // Match score when the enquiry was sent, shown when comparing proposals.
    matchScore: integer("match_score"),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("enquiry_req_pro_uq").on(t.requirementId, t.professionalUserId)],
);

export const proposal = pgTable(
  "proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id").notNull().references(() => requirement.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    professionalUserId: uuid("professional_user_id").notNull().references(() => user.id),
    feePaise: integer("fee_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    proposedStart: timestamp("proposed_start", { withTimezone: true }).notNull(),
    maxParticipants: integer("max_participants").notNull(),
    inclusions: text("inclusions").notNull().default(""),
    message: text("message").notNull().default(""),
    freeCancellationDays: integer("free_cancellation_days").notNull().default(7),
    // Set when the company asks for changes; cleared when the professional revises.
    revisionNote: text("revision_note"),
    revisionCount: integer("revision_count").notNull().default(0),
    status: text("status", { enum: ["draft", "submitted", "revision_requested", "accepted", "rejected", "withdrawn"] })
      .notNull()
      .default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposal_req_idx").on(t.requirementId), uniqueIndex("proposal_req_pro_uq").on(t.requirementId, t.professionalUserId)],
);

export const booking = pgTable(
  "booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id").notNull().unique().references(() => proposal.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    professionalUserId: uuid("professional_user_id").notNull().references(() => user.id),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"] }).notNull().default("pending"),
    location: text("location").notNull().default(""),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => user.id),
    cancelReason: text("cancel_reason"),
    // True when cancelled inside the free-cancellation window (a fee may apply, see M4).
    cancelledLate: boolean("cancelled_late").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Price snapshot, fixed when payment starts (integer paise). See payments.ts.
    feePaise: integer("fee_paise"),
    gstPaise: integer("gst_paise"),
    totalPaise: integer("total_paise"),
    commissionPaise: integer("commission_paise"),
    payablePaise: integer("payable_paise"),
    paymentStatus: text("payment_status", { enum: ["unpaid", "invoiced", "paid", "partially_refunded", "refunded"] }).notNull().default("unpaid"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedPaise: integer("refunded_paise").notNull().default(0),
    // The professional's share of refunds (so their earnings stay exact without reading the ledger).
    payableReversedPaise: integer("payable_reversed_paise").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_org_idx").on(t.orgId), index("booking_pro_idx").on(t.professionalUserId)],
);

export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => booking.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    // "razorpay" = paid online; "invoice" = bank transfer against a tax invoice.
    provider: text("provider", { enum: ["razorpay", "invoice"] }).notNull().default("razorpay"),
    providerOrderId: text("provider_order_id").unique(),
    providerPaymentId: text("provider_payment_id").unique(),
    method: text("method"),
    reference: text("reference"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status", { enum: ["pending", "authorized", "paid", "failed", "cancelled", "partially_refunded", "refunded"] })
      .notNull()
      .default("pending"),
    failureReason: text("failure_reason"),
    invoiceId: uuid("invoice_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_booking_idx").on(t.bookingId)],
);

export type InvoiceParty = { name: string; gstin: string; address: string; email?: string; stateCode: string };
export type InvoiceLine = { description: string; sac: string; quantity: number; taxablePaise: number; gstRateBps: number };

/** Tax invoices and credit notes. Numbers are sequential per financial year and never reused. */
export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    bookingId: uuid("booking_id").notNull().references(() => booking.id),
    number: text("number").notNull().unique(),
    kind: text("kind", { enum: ["invoice", "credit_note"] }).notNull().default("invoice"),
    // invoice: unpaid → paid, or cancelled (by a credit note). credit_note: issued.
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
  (t) => [index("invoice_org_idx").on(t.orgId), index("invoice_booking_idx").on(t.bookingId)],
);

export const refund = pgTable(
  "refund",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    bookingId: uuid("booking_id").notNull().references(() => booking.id),
    paymentId: uuid("payment_id").notNull().references(() => payment.id),
    amountPaise: integer("amount_paise").notNull(),
    // "razorpay" refunds go back automatically; "manual" ones are bank transfers recorded by staff.
    provider: text("provider", { enum: ["razorpay", "manual"] }).notNull(),
    providerRefundId: text("provider_refund_id").unique(),
    status: text("status", { enum: ["pending", "processed", "failed"] }).notNull().default("pending"),
    reason: text("reason").notNull().default(""),
    reference: text("reference"),
    failureReason: text("failure_reason"),
    creditNoteId: uuid("credit_note_id"),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("refund_booking_idx").on(t.bookingId)],
);

/** Money sent to a professional for a booking. Recorded manually by staff for now. */
export const payout = pgTable(
  "payout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    bookingId: uuid("booking_id").notNull().references(() => booking.id),
    professionalUserId: uuid("professional_user_id").notNull().references(() => user.id),
    amountPaise: integer("amount_paise").notNull(),
    reference: text("reference").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    recordedBy: uuid("recorded_by").notNull().references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payout_pro_idx").on(t.professionalUserId), index("payout_booking_idx").on(t.bookingId)],
);

// Append-only. Corrections are new reversing rows; UPDATE/DELETE are blocked by a trigger.
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => booking.id),
    paymentId: uuid("payment_id").references(() => payment.id),
    refundId: uuid("refund_id").references(() => refund.id),
    payoutId: uuid("payout_id").references(() => payout.id),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    entryType: text("entry_type", {
      enum: ["gross", "tax", "platform_commission", "provider_payable", "refund", "settlement", "reversal"],
    }).notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    memo: text("memo").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_booking_idx").on(t.bookingId)],
);

/** Platform-wide money settings (one row, id "default"). Edited by super admins. */
export const financeSettings = pgTable("finance_settings", {
  id: text("id").primaryKey().default("default"),
  commissionBps: integer("commission_bps").notNull().default(1000),
  gstBps: integer("gst_bps").notNull().default(1800),
  // Share of the total refunded when a company cancels inside the free window (0 = none).
  lateCancelRefundBps: integer("late_cancel_refund_bps").notNull().default(0),
  paymentTermsDays: integer("payment_terms_days").notNull().default(7),
  sellerName: text("seller_name").notNull().default(""),
  sellerGstin: text("seller_gstin").notNull().default(""),
  sellerAddress: text("seller_address").notNull().default(""),
  sellerStateCode: text("seller_state_code").notNull().default("29"),
  sacCode: text("sac_code").notNull().default("999799"),
  invoicePrefix: text("invoice_prefix").notNull().default("MSM"),
  bankDetails: text("bank_details").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Next invoice/credit-note number per series and financial year. */
export const invoiceCounter = pgTable("invoice_counter", {
  series: text("series").primaryKey(),
  next: integer("next").notNull().default(1),
});

/** Razorpay webhook event ids already handled: a replayed event is a no-op. */
export const webhookEvent = pgTable("webhook_event", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matchingWeights = pgTable("matching_weights", {
  id: text("id").primaryKey().default("default"),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

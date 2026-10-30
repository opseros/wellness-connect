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
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_org_idx").on(t.orgId), index("booking_pro_idx").on(t.professionalUserId)],
);

export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => booking.id),
  orgId: uuid("org_id").notNull().references(() => organization.id),
  provider: text("provider").notNull().default("razorpay"),
  providerOrderId: text("provider_order_id").unique(),
  providerPaymentId: text("provider_payment_id").unique(),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  status: text("status", { enum: ["pending", "authorized", "paid", "failed", "partially_refunded", "refunded"] })
    .notNull()
    .default("pending"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only. Corrections are new reversing rows; UPDATE/DELETE are blocked by a trigger.
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => booking.id),
    paymentId: uuid("payment_id").references(() => payment.id),
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

export const matchingWeights = pgTable("matching_weights", {
  id: text("id").primaryKey().default("default"),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

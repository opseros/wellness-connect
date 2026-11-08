// Wellness credits: a company prepays each month so every employee gets a
// monthly allowance to spend on Moosam (sessions now; gym plans next).
//
// Money model (decided with the founder; confirm with your CA before launch):
// - The company pays upfront each month: seats × allowance, minus whatever is
//   still unspent in its pool (unused credits stay with the company and
//   reduce the next month's payment; they don't roll over per employee).
// - When an employee pays with credits, the full price leaves the pool;
//   Moosam keeps the member booking fee (finance_settings.member_fee_bps)
//   and owes the rest to the provider.
//
// credit_entry is append-only (a trigger blocks UPDATE and DELETE):
//   fund    + money the company paid into its pool
//   spend   + credits an employee spent (fee + payable = amount)
//   refund  + credits returned for a cancelled spend (same period as the spend)
// Pool balance = Σfund − Σspend + Σrefund, never below zero.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organizations";

export const benefitPolicy = pgTable(
  "benefit_policy",
  {
    orgId: uuid("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(false),
    allowancePaise: integer("allowance_paise").notNull().default(0),
    coverSessions: boolean("cover_sessions").notNull().default(true),
    coverFacilities: boolean("cover_facilities").notNull().default(true),
    coverStays: boolean("cover_stays").notNull().default(false),
    partnersOnly: boolean("partners_only").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("benefit_policy_allowance_chk", sql`${t.allowancePaise} >= 0`)],
);

export const CREDIT_FUNDING_STATUSES = ["due", "paid", "cancelled"] as const;

/** One prepayment per company per month ("YYYY-MM"). */
export const creditFunding = pgTable(
  "credit_funding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    period: text("period").notNull(),
    seats: integer("seats").notNull(),
    allowancePaise: integer("allowance_paise").notNull(),
    requiredPaise: integer("required_paise").notNull(),
    carriedPaise: integer("carried_paise").notNull(),
    duePaise: integer("due_paise").notNull(),
    status: text("status", { enum: CREDIT_FUNDING_STATUSES }).notNull().default("due"),
    method: text("method"),
    reference: text("reference"),
    recordedBy: uuid("recorded_by").references(() => user.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_funding_period_uq").on(t.orgId, t.period),
    check("credit_funding_money_chk", sql`${t.duePaise} >= 0 and ${t.requiredPaise} >= 0 and ${t.carriedPaise} >= 0`),
  ],
);

export const CREDIT_ENTRY_TYPES = ["fund", "spend", "refund"] as const;
export const CREDIT_REF_TYPES = ["session", "plan"] as const;

export const creditEntry = pgTable(
  "credit_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    userId: uuid("user_id").references(() => user.id),
    period: text("period").notNull(),
    type: text("type", { enum: CREDIT_ENTRY_TYPES }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    feePaise: integer("fee_paise").notNull().default(0),
    payablePaise: integer("payable_paise").notNull().default(0),
    // What the credits paid for. Only the employee (and staff) can see this per person.
    category: text("category", { enum: ["sessions", "facilities", "stays"] }),
    refType: text("ref_type", { enum: CREDIT_REF_TYPES }),
    refId: uuid("ref_id"),
    fundingId: uuid("funding_id").references(() => creditFunding.id),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_entry_org_idx").on(t.orgId, t.period),
    index("credit_entry_user_idx").on(t.userId, t.period),
    index("credit_entry_ref_idx").on(t.refType, t.refId),
    check("credit_entry_amount_chk", sql`${t.amountPaise} > 0 and ${t.feePaise} >= 0 and ${t.payablePaise} >= 0`),
    check("credit_entry_split_chk", sql`${t.type} = 'fund' or ${t.feePaise} + ${t.payablePaise} = ${t.amountPaise}`),
    check("credit_entry_user_chk", sql`(${t.type} = 'fund') = (${t.userId} is null)`),
  ],
);


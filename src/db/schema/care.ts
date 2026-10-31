import { pgTable, uuid, text, timestamp, integer, boolean, date, jsonb, index, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organizations";
import { stay } from "./stays";

/**
 * Care & Travel (M8): hospital treatment packages, quote requests to up to
 * three hospitals, optional medical reports shared with consent, and a care
 * trip plan. Health data is minimised: a request carries the treatment, an
 * age range, the country and an optional note; no names until the traveller
 * accepts a quote. Reports are encrypted before storage, visible only to the
 * hospitals the traveller chose, every open is logged, and they are deleted
 * 90 days after the trip unless the traveller keeps them.
 */

export const AGE_RANGES = ["18-29", "30-39", "40-49", "50-59", "60-69", "70+"] as const;
export const CARE_NEEDS = ["visa_letter", "interpreter", "airport_pickup", "recovery_stay"] as const;
export const QUOTE_STATUSES = ["requested", "reports_requested", "quoted", "declined", "accepted", "not_selected", "withdrawn"] as const;

/** A hospital's treatment package. Public information once the hospital is verified. */
export const carePackage = pgTable(
  "care_package",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    specialty: text("specialty").notNull(),
    description: text("description").notNull().default(""),
    includes: text("includes").array().notNull().default([]),
    hospitalNights: integer("hospital_nights").notNull().default(0),
    recoveryNights: integer("recovery_nights").notNull().default(0),
    priceMinPaise: integer("price_min_paise").notNull(),
    priceMaxPaise: integer("price_max_paise").notNull(),
    // Corporate health check-ups that companies can ask for.
    forCompanies: boolean("for_companies").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("care_package_org_idx").on(t.orgId)],
);

export const careRequest = pgTable(
  "care_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterUserId: uuid("requester_user_id").notNull().references(() => user.id),
    // Set for a company's health check-up request (no individual health data at all).
    requesterOrgId: uuid("requester_org_id").references(() => organization.id),
    kind: text("kind", { enum: ["treatment", "health_check"] }).notNull().default("treatment"),
    treatment: text("treatment").notNull(),
    specialty: text("specialty").notNull().default(""),
    ageRange: text("age_range"),
    headcount: integer("headcount"),
    travellingFrom: text("travelling_from").notNull().default(""),
    arriveMonth: text("arrive_month"),
    companions: integer("companions").notNull().default(0),
    needs: text("needs").array().notNull().default([]),
    interpreterLanguage: text("interpreter_language").notNull().default(""),
    note: text("note").notNull().default(""),
    status: text("status", { enum: ["open", "accepted", "closed", "withdrawn"] }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("care_request_user_idx").on(t.requesterUserId)],
);

/** One per chosen hospital. Requester ids are copied here so row-level security needs no join. */
export const careQuote = pgTable(
  "care_quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => careRequest.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    requesterUserId: uuid("requester_user_id").notNull().references(() => user.id),
    requesterOrgId: uuid("requester_org_id").references(() => organization.id),
    status: text("status", { enum: QUOTE_STATUSES }).notNull().default("requested"),
    packageId: uuid("package_id").references(() => carePackage.id),
    priceMinPaise: integer("price_min_paise"),
    priceMaxPaise: integer("price_max_paise"),
    hospitalNights: integer("hospital_nights"),
    earliestDate: date("earliest_date"),
    validUntil: date("valid_until"),
    message: text("message").notNull().default(""),
    respondedBy: uuid("responded_by").references(() => user.id),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("care_quote_request_org_uq").on(t.requestId, t.orgId), index("care_quote_org_idx").on(t.orgId)],
);

/** An uploaded report. The stored file is AES-256-GCM encrypted; `blob_path` is cleared when deleted. */
export const careReport = pgTable(
  "care_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => careRequest.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").notNull().references(() => user.id),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    blobPath: text("blob_path"),
    keep: boolean("keep").notNull().default(false),
    deleteAfter: timestamp("delete_after", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("care_report_request_idx").on(t.requestId)],
);

/** Consent: this report may be opened by this hospital (until revoked). */
export const careReportShare = pgTable(
  "care_report_share",
  {
    reportId: uuid("report_id").notNull().references(() => careReport.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    ownerUserId: uuid("owner_user_id").notNull().references(() => user.id),
    consentText: text("consent_text").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.orgId] })],
);

/** Every time someone at a hospital opens a report. The traveller can see this log. */
export const careReportAccess = pgTable(
  "care_report_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").notNull().references(() => careReport.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    ownerUserId: uuid("owner_user_id").notNull().references(() => user.id),
    userId: uuid("user_id").notNull().references(() => user.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("care_report_access_report_idx").on(t.reportId)],
);

export type ChecklistItem = { key: string; label: string; done: boolean };

/** The traveller's plan once a quote is accepted. Only the traveller sees it. */
export const careTrip = pgTable("care_trip", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().unique().references(() => careRequest.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull().references(() => user.id),
  quoteId: uuid("quote_id").notNull().references(() => careQuote.id),
  arriveOn: date("arrive_on"),
  departOn: date("depart_on"),
  stayId: uuid("stay_id").references(() => stay.id),
  checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

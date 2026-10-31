import { pgTable, uuid, text, timestamp, integer, boolean, index, primaryKey } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const DELIVERY_MODES = ["in_person", "virtual", "hybrid"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // When true, a professional needs at least one approved credential to be matched.
  requiresCredential: boolean("requires_credential").notNull().default(true),
  // Platform commission for bookings in this category, in basis points (100 = 1%).
  // Null = use the default in finance_settings.
  commissionBps: integer("commission_bps"),
});

export const professionalProfile = pgTable(
  "professional_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
    headline: text("headline").notNull().default(""),
    bio: text("bio").notNull().default(""),
    city: text("city").notNull().default(""),
    countryCode: text("country_code").notNull().default("IN"),
    yearsExperience: integer("years_experience").notNull().default(0),
    languages: text("languages").array().notNull().default([]),
    deliveryModes: text("delivery_modes", { enum: DELIVERY_MODES }).array().notNull().default([]),
    // Kept separate from profile completeness, as the blueprint requires.
    verificationStatus: text("verification_status", { enum: ["unverified", "pending", "verified", "rejected"] })
      .notNull()
      .default("unverified"),
    discoverable: boolean("discoverable").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("professional_city_idx").on(t.city)],
);

export const professionalCategory = pgTable(
  "professional_category",
  {
    profileId: uuid("profile_id").notNull().references(() => professionalProfile.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => category.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.categoryId] })],
);

export const credential = pgTable(
  "credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => professionalProfile.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    issuer: text("issuer").notNull().default(""),
    // Path in the private Vercel Blob store. Never a public URL.
    blobPath: text("blob_path"),
    status: text("status", { enum: ["pending", "approved", "rejected", "info_requested"] }).notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => user.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credential_profile_idx").on(t.profileId), index("credential_status_idx").on(t.status)],
);

export const service = pgTable(
  "service",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => professionalProfile.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => category.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    deliveryModes: text("delivery_modes", { enum: DELIVERY_MODES }).array().notNull().default([]),
    durationMinutes: integer("duration_minutes").notNull(),
    // Money is always integer paise (1 INR = 100 paise) plus an ISO currency code.
    priceMinPaise: integer("price_min_paise").notNull(),
    priceMaxPaise: integer("price_max_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("service_profile_idx").on(t.profileId), index("service_category_idx").on(t.categoryId)],
);

import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organizations";

// "facility": gyms, yoga and pilates studios, pools, spas and wellness centres.
export const LISTING_KINDS = ["homestay", "hospital", "facility"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

/** draft → pending (submitted) → verified | changes_requested | rejected. Only "verified" is ever public. */
export const LISTING_STATUSES = ["draft", "pending", "verified", "changes_requested", "rejected"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const HOMESTAY_FEATURES = [
  "step_free",
  "ground_floor_room",
  "near_hospital",
  "diet_kitchen",
  "caregiver_room",
  "quiet_hours",
  "wifi_workspace",
  "parking",
  "meeting_space",
] as const;

/** Homestay cancellation policies; the rules live in src/modules/stays/policy.ts. */
export const CANCELLATION_POLICIES = ["flexible", "moderate", "strict"] as const;

export const HOSPITAL_SERVES = ["domestic", "international", "both"] as const;

export const FACILITY_TYPES = ["gym", "yoga", "pilates", "swimming", "spa", "wellness_centre", "sports", "martial_arts", "dance"] as const;
export const FACILITY_AMENITIES = [
  "trainers",
  "group_classes",
  "women_only",
  "showers_lockers",
  "parking",
  "step_free",
  "air_conditioned",
  "steam_sauna",
  "online_classes",
] as const;
export const ACCREDITATIONS = ["NABH", "JCI", "NABL"] as const;

/**
 * Public profile of a homestay or hospital organisation (one per org).
 * Contact email and phone are for our verification team only and are never
 * shown in the directory. Kind-specific columns are null/empty for the other kind.
 */
export const listing = pgTable(
  "listing",
  {
    orgId: uuid("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: LISTING_KINDS }).notNull(),
    status: text("status", { enum: LISTING_STATUSES }).notNull().default("draft"),
    tagline: text("tagline").notNull().default(""),
    about: text("about").notNull().default(""),
    city: text("city").notNull().default(""),
    state: text("state").notNull().default(""),
    area: text("area").notNull().default(""),
    contactEmail: text("contact_email").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    website: text("website").notNull().default(""),
    languages: text("languages").array().notNull().default([]),
    // Homestays
    rooms: integer("rooms"),
    maxGuests: integer("max_guests"),
    priceFromPaise: integer("price_from_paise"),
    features: text("features").array().notNull().default([]),
    houseRules: text("house_rules").notNull().default(""),
    cancellationPolicy: text("cancellation_policy", { enum: CANCELLATION_POLICIES }).notNull().default("moderate"),
    minNights: integer("min_nights").notNull().default(1),
    checkInTime: text("check_in_time").notNull().default("14:00"),
    checkOutTime: text("check_out_time").notNull().default("11:00"),
    // Hospitals
    specialties: text("specialties").array().notNull().default([]),
    accreditations: text("accreditations").array().notNull().default([]),
    // True only when staff checked an accreditation certificate for exactly these accreditations.
    accreditationVerified: boolean("accreditation_verified").notNull().default(false),
    beds: integer("beds"),
    serves: text("serves", { enum: HOSPITAL_SERVES }).notNull().default("both"),
    internationalDesk: boolean("international_desk").notNull().default(false),
    visaLetter: boolean("visa_letter").notNull().default(false),
    // Facilities (gyms, studios, wellness centres). Prices are "from", in paise.
    facilityTypes: text("facility_types").array().notNull().default([]),
    amenities: text("amenities").array().notNull().default([]),
    openingHours: text("opening_hours").notNull().default(""),
    membershipFromPaise: integer("membership_from_paise"),
    dropInPaise: integer("drop_in_paise"),
    freeTrial: boolean("free_trial").notNull().default(false),
    corporatePlans: boolean("corporate_plans").notNull().default(false),
    // Review
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => user.id),
    reviewNote: text("review_note"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_kind_status_idx").on(t.kind, t.status), index("listing_city_idx").on(t.city)],
);

/**
 * Verification documents (registration, owner ID, accreditation...). Private:
 * row-level security limits rows to the organisation (app.org_id) and audited
 * staff (bypass); files live in private storage and are never public.
 */
export const orgDocument = pgTable(
  "org_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    name: text("name").notNull(),
    blobPath: text("blob_path").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => user.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    uploadedBy: uuid("uploaded_by").notNull().references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("org_document_org_idx").on(t.orgId)],
);

/** Listing photos. Served publicly only once the listing is verified. */
export const listingPhoto = pgTable(
  "listing_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    blobPath: text("blob_path").notNull(),
    caption: text("caption").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_photo_org_idx").on(t.orgId)],
);

import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** One login per person; companies, homestays and hospitals are organisations with members and roles. */
export const ORG_KINDS = ["company", "provider", "homestay", "hospital"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const organization = pgTable(
  "organization",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    kind: text("kind", { enum: ORG_KINDS }).notNull().default("company"),
    // Verified email domain, lower case, e.g. "northwindlabs.com".
    domain: text("domain"),
    domainVerifiedAt: timestamp("domain_verified_at", { withTimezone: true }),
    countryCode: text("country_code").notNull().default("IN"),
    // Company settings: where sessions usually happen and who receives invoices (M4).
    city: text("city").notNull().default(""),
    address: text("address").notNull().default(""),
    billingEmail: text("billing_email").notNull().default(""),
    gstin: text("gstin").notNull().default(""),
    // Set by platform staff. A suspended organisation is hidden from directories and its
    // members can't use its workspace until the suspension is lifted. A removed one is
    // closed for good: memberships are deleted, records (bookings, stays, invoices) stay.
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organization_domain_uq").on(t.domain)],
);

export const ORG_ROLES = ["owner", "admin", "wellness_manager", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ORG_ROLES }).notNull().default("member"),
    // "pending" = asked to join via email domain; an owner/admin approves.
    status: text("status", { enum: ["active", "pending"] }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("membership_org_user_uq").on(t.orgId, t.userId), index("membership_user_idx").on(t.userId)],
);

export const INVITE_ROLES = ["admin", "wellness_manager", "member"] as const;

/**
 * Invitations by email. Only a SHA-256 hash of the token is stored; the
 * link in the email is the only copy of the token. Accepting requires being
 * signed in with a verified email equal to the invited address.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: INVITE_ROLES }).notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").notNull().references(() => user.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitation_org_idx").on(t.orgId), index("invitation_email_idx").on(t.email)],
);

import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const organization = pgTable(
  "organization",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    kind: text("kind", { enum: ["company", "provider"] }).notNull().default("company"),
    // Verified email domain, lower case, e.g. "northwindlabs.com".
    domain: text("domain"),
    domainVerifiedAt: timestamp("domain_verified_at", { withTimezone: true }),
    countryCode: text("country_code").notNull().default("IN"),
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

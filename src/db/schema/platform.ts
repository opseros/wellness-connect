import { pgTable, uuid, text, timestamp, integer, jsonb, bigserial, index, boolean } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Transactional outbox: write an event in the same transaction as the
// business change; the cron worker delivers it (email, notifications).
export const outbox = pgTable(
  "outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_pending_idx").on(t.processedAt, t.availableAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => user.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_target_idx").on(t.targetType, t.targetId)],
);

/**
 * Platform switches that super admins flip in Admin → Settings (e.g. "hospitals").
 * A missing row means the feature's default in src/modules/platform/features.ts.
 */
export const featureFlag = pgTable("feature_flag", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => user.id),
});

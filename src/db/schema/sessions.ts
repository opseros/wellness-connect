import { pgTable, uuid, text, timestamp, integer, boolean, index, primaryKey, date } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { professionalProfile, service } from "./professionals";

/**
 * Member sessions with professionals (one-to-one bookings by members, not companies).
 * Times are stored as UTC instants; availability is set in India time (minutes from midnight IST).
 */

/** Booking settings for one professional. No personal data. */
export const proBookingSettings = pgTable("pro_booking_settings", {
  profileId: uuid("profile_id").primaryKey().references(() => professionalProfile.id, { onDelete: "cascade" }),
  // Off until the professional switches member bookings on.
  enabled: boolean("enabled").notNull().default(false),
  minNoticeHours: integer("min_notice_hours").notNull().default(12),
  maxDaysAhead: integer("max_days_ahead").notNull().default(30),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  // A standing meeting link (Google Meet, Zoom) shared with members once a session is confirmed.
  meetingLink: text("meeting_link").notNull().default(""),
  // Where in-person sessions happen; shown only once a session is confirmed.
  inPersonAddress: text("in_person_address").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Weekly opening hours: one row per window, e.g. Monday 09:00–13:00 (IST minutes). */
export const proAvailability = pgTable(
  "pro_availability",
  {
    profileId: uuid("profile_id").notNull().references(() => professionalProfile.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0 = Sunday … 6 = Saturday
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.weekday, t.startMinute] })],
);

/** Whole days off. */
export const proTimeOff = pgTable(
  "pro_time_off",
  {
    profileId: uuid("profile_id").notNull().references(() => professionalProfile.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.day] })],
);

export const APPOINTMENT_STATUSES = ["requested", "accepted", "confirmed", "completed", "declined", "cancelled", "expired"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_MODES = ["online", "in_person"] as const;

/**
 * A member's session with a professional. Row-level security: the member, the
 * professional (denormalised `pro_user_id`), or audited bypass. Keep the note short
 * and free of health details (the UI says so).
 */
export const appointment = pgTable(
  "appointment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => professionalProfile.id),
    proUserId: uuid("pro_user_id").notNull().references(() => user.id),
    memberUserId: uuid("member_user_id").notNull().references(() => user.id),
    serviceId: uuid("service_id").notNull().references(() => service.id),
    serviceTitle: text("service_title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    mode: text("mode", { enum: APPOINTMENT_MODES }).notNull(),
    status: text("status", { enum: APPOINTMENT_STATUSES }).notNull().default("requested"),
    // Price snapshot in paise (GST and payment details come with payments).
    pricePaise: integer("price_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    note: text("note").notNull().default(""),
    respondBy: timestamp("respond_by", { withTimezone: true }).notNull(),
    payBy: timestamp("pay_by", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    proNote: text("pro_note"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => user.id),
    cancelReason: text("cancel_reason"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("appointment_pro_idx").on(t.profileId, t.startsAt), index("appointment_member_idx").on(t.memberUserId, t.startsAt)],
);

/**
 * Busy time per professional while a session is requested, accepted or confirmed.
 * Times only (no personal data, no RLS) so members can see which slots are free.
 */
export const appointmentHold = pgTable(
  "appointment_hold",
  {
    appointmentId: uuid("appointment_id").primaryKey().references(() => appointment.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => professionalProfile.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("appointment_hold_pro_idx").on(t.profileId, t.startsAt)],
);

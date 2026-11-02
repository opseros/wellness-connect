CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"pro_user_id" uuid NOT NULL,
	"member_user_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"price_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"respond_by" timestamp with time zone NOT NULL,
	"pay_by" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"pro_note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"reminder_sent_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "appointment_hold" (
	"appointment_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_availability" (
	"profile_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "pro_availability_profile_id_weekday_start_minute_pk" PRIMARY KEY("profile_id","weekday","start_minute")
);
--> statement-breakpoint
CREATE TABLE "pro_booking_settings" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"min_notice_hours" integer DEFAULT 12 NOT NULL,
	"max_days_ahead" integer DEFAULT 30 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"meeting_link" text DEFAULT '' NOT NULL,
	"in_person_address" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_time_off" (
	"profile_id" uuid NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "pro_time_off_profile_id_day_pk" PRIMARY KEY("profile_id","day")
);
--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "member_price_paise" integer;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_pro_user_id_user_id_fk" FOREIGN KEY ("pro_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_hold" ADD CONSTRAINT "appointment_hold_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_hold" ADD CONSTRAINT "appointment_hold_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_availability" ADD CONSTRAINT "pro_availability_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_booking_settings" ADD CONSTRAINT "pro_booking_settings_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_time_off" ADD CONSTRAINT "pro_time_off_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_pro_idx" ON "appointment" USING btree ("profile_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointment_member_idx" ON "appointment" USING btree ("member_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointment_hold_pro_idx" ON "appointment_hold" USING btree ("profile_id","starts_at");
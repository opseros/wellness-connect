CREATE TABLE "stay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"nights" integer NOT NULL,
	"rooms" integer DEFAULT 1 NOT NULL,
	"guests" integer DEFAULT 1 NOT NULL,
	"purpose" text NOT NULL,
	"access_needs" text[] DEFAULT '{}' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"billing_name" text DEFAULT '' NOT NULL,
	"billing_gstin" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"respond_by" timestamp with time zone NOT NULL,
	"pay_by" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"host_note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_by_host" boolean DEFAULT false NOT NULL,
	"cancel_reason" text,
	"nightly" jsonb NOT NULL,
	"gst_parts" jsonb NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"gst_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"commission_paise" integer NOT NULL,
	"payable_paise" integer NOT NULL,
	"cancellation_policy" text NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_paise" integer DEFAULT 0 NOT NULL,
	"payable_reversed_paise" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "stay_calendar" (
	"org_id" uuid NOT NULL,
	"day" date NOT NULL,
	"price_paise" integer,
	"blocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "stay_calendar_org_id_day_pk" PRIMARY KEY("org_id","day")
);
--> statement-breakpoint
CREATE TABLE "stay_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stay_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"status" text NOT NULL,
	"related_invoice_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"seller" jsonb NOT NULL,
	"buyer" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"place_of_supply" text NOT NULL,
	"taxable_paise" integer NOT NULL,
	"cgst_paise" integer DEFAULT 0 NOT NULL,
	"sgst_paise" integer DEFAULT 0 NOT NULL,
	"igst_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	CONSTRAINT "stay_invoice_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "stay_ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stay_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"payment_id" uuid,
	"refund_id" uuid,
	"payout_id" uuid,
	"entry_type" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_night" (
	"stay_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"day" date NOT NULL,
	"rooms" integer NOT NULL,
	"hold_until" timestamp with time zone,
	CONSTRAINT "stay_night_stay_id_day_pk" PRIMARY KEY("stay_id","day")
);
--> statement-breakpoint
CREATE TABLE "stay_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stay_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"method" text,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"invoice_id" uuid,
	"paid_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_payment_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "stay_payment_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "stay_payment_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "stay_payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stay_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"reference" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stay_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"provider_refund_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"failure_reason" text,
	"credit_note_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "stay_refund_provider_refund_id_unique" UNIQUE("provider_refund_id")
);
--> statement-breakpoint
ALTER TABLE "finance_settings" ADD COLUMN "stay_commission_bps" integer DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_settings" ADD COLUMN "stay_gst_low_bps" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_settings" ADD COLUMN "stay_gst_high_bps" integer DEFAULT 1800 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_settings" ADD COLUMN "stay_gst_threshold_paise" integer DEFAULT 750000 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_settings" ADD COLUMN "stay_sac_code" text DEFAULT '996311' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "cancellation_policy" text DEFAULT 'moderate' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "min_nights" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "check_in_time" text DEFAULT '14:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "check_out_time" text DEFAULT '11:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_guest_user_id_user_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_calendar" ADD CONSTRAINT "stay_calendar_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_invoice" ADD CONSTRAINT "stay_invoice_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_invoice" ADD CONSTRAINT "stay_invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_invoice" ADD CONSTRAINT "stay_invoice_guest_user_id_user_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD CONSTRAINT "stay_ledger_entry_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD CONSTRAINT "stay_ledger_entry_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD CONSTRAINT "stay_ledger_entry_guest_user_id_user_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD CONSTRAINT "stay_ledger_entry_payment_id_stay_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."stay_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD CONSTRAINT "stay_ledger_entry_refund_id_stay_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."stay_refund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD CONSTRAINT "stay_ledger_entry_payout_id_stay_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."stay_payout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_night" ADD CONSTRAINT "stay_night_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_night" ADD CONSTRAINT "stay_night_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_payment" ADD CONSTRAINT "stay_payment_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_payment" ADD CONSTRAINT "stay_payment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_payment" ADD CONSTRAINT "stay_payment_guest_user_id_user_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_payout" ADD CONSTRAINT "stay_payout_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_payout" ADD CONSTRAINT "stay_payout_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_payout" ADD CONSTRAINT "stay_payout_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_refund" ADD CONSTRAINT "stay_refund_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_refund" ADD CONSTRAINT "stay_refund_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_refund" ADD CONSTRAINT "stay_refund_guest_user_id_user_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_refund" ADD CONSTRAINT "stay_refund_payment_id_stay_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."stay_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_refund" ADD CONSTRAINT "stay_refund_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stay_org_idx" ON "stay" USING btree ("org_id","check_in");--> statement-breakpoint
CREATE INDEX "stay_guest_idx" ON "stay" USING btree ("guest_user_id");--> statement-breakpoint
CREATE INDEX "stay_invoice_stay_idx" ON "stay_invoice" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "stay_ledger_stay_idx" ON "stay_ledger_entry" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "stay_night_org_day_idx" ON "stay_night" USING btree ("org_id","day");--> statement-breakpoint
CREATE INDEX "stay_payment_stay_idx" ON "stay_payment" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "stay_payout_stay_idx" ON "stay_payout" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "stay_refund_stay_idx" ON "stay_refund" USING btree ("stay_id");
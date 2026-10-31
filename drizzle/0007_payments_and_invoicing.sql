CREATE TABLE "finance_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"commission_bps" integer DEFAULT 1000 NOT NULL,
	"gst_bps" integer DEFAULT 1800 NOT NULL,
	"late_cancel_refund_bps" integer DEFAULT 0 NOT NULL,
	"payment_terms_days" integer DEFAULT 7 NOT NULL,
	"seller_name" text DEFAULT '' NOT NULL,
	"seller_gstin" text DEFAULT '' NOT NULL,
	"seller_address" text DEFAULT '' NOT NULL,
	"seller_state_code" text DEFAULT '29' NOT NULL,
	"sac_code" text DEFAULT '999799' NOT NULL,
	"invoice_prefix" text DEFAULT 'MSM' NOT NULL,
	"bank_details" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
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
	CONSTRAINT "invoice_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "invoice_counter" (
	"series" text PRIMARY KEY NOT NULL,
	"next" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"professional_user_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"reference" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_refund_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"reference" text,
	"failure_reason" text,
	"credit_note_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "refund_provider_refund_id_unique" UNIQUE("provider_refund_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "commission_bps" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "fee_paise" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "gst_paise" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "total_paise" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "commission_paise" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payable_paise" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_status" text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "refunded_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payable_reversed_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD COLUMN "refund_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_professional_user_id_user_id_fk" FOREIGN KEY ("professional_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_org_idx" ON "invoice" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invoice_booking_idx" ON "invoice" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payout_pro_idx" ON "payout" USING btree ("professional_user_id");--> statement-breakpoint
CREATE INDEX "payout_booking_idx" ON "payout" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "refund_booking_idx" ON "refund" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payout_id_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_booking_idx" ON "payment" USING btree ("booking_id");
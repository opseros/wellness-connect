CREATE TABLE "facility_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"price_paise" integer NOT NULL,
	"valid_days" integer NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_plan_price_chk" CHECK ("facility_plan"."price_paise" > 0 and "facility_plan"."valid_days" between 1 and 400)
);
--> statement-breakpoint
CREATE TABLE "plan_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"price_paise" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"paid_with" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"idempotency_key" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_purchase_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "benefit_partner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stay" ADD COLUMN "company_org_id" uuid;--> statement-breakpoint
ALTER TABLE "stay_invoice" ADD COLUMN "company_org_id" uuid;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD COLUMN "company_org_id" uuid;--> statement-breakpoint
ALTER TABLE "stay_payment" ADD COLUMN "company_org_id" uuid;--> statement-breakpoint
ALTER TABLE "stay_refund" ADD COLUMN "company_org_id" uuid;--> statement-breakpoint
ALTER TABLE "facility_plan" ADD CONSTRAINT "facility_plan_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_purchase" ADD CONSTRAINT "plan_purchase_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_purchase" ADD CONSTRAINT "plan_purchase_plan_id_facility_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."facility_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_purchase" ADD CONSTRAINT "plan_purchase_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facility_plan_org_idx" ON "facility_plan" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "plan_purchase_org_idx" ON "plan_purchase" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "plan_purchase_user_idx" ON "plan_purchase" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_purchase_key_uq" ON "plan_purchase" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_company_org_id_organization_id_fk" FOREIGN KEY ("company_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_invoice" ADD CONSTRAINT "stay_invoice_company_org_id_organization_id_fk" FOREIGN KEY ("company_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" ADD CONSTRAINT "stay_ledger_entry_company_org_id_organization_id_fk" FOREIGN KEY ("company_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_payment" ADD CONSTRAINT "stay_payment_company_org_id_organization_id_fk" FOREIGN KEY ("company_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_refund" ADD CONSTRAINT "stay_refund_company_org_id_organization_id_fk" FOREIGN KEY ("company_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
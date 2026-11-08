CREATE TABLE "benefit_policy" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"allowance_paise" integer DEFAULT 0 NOT NULL,
	"cover_sessions" boolean DEFAULT true NOT NULL,
	"cover_facilities" boolean DEFAULT true NOT NULL,
	"cover_stays" boolean DEFAULT false NOT NULL,
	"partners_only" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benefit_policy_allowance_chk" CHECK ("benefit_policy"."allowance_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"period" text NOT NULL,
	"type" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"fee_paise" integer DEFAULT 0 NOT NULL,
	"payable_paise" integer DEFAULT 0 NOT NULL,
	"category" text,
	"ref_type" text,
	"ref_id" uuid,
	"funding_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_entry_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_entry_amount_chk" CHECK ("credit_entry"."amount_paise" > 0 and "credit_entry"."fee_paise" >= 0 and "credit_entry"."payable_paise" >= 0),
	CONSTRAINT "credit_entry_split_chk" CHECK ("credit_entry"."type" = 'fund' or "credit_entry"."fee_paise" + "credit_entry"."payable_paise" = "credit_entry"."amount_paise"),
	CONSTRAINT "credit_entry_user_chk" CHECK (("credit_entry"."type" = 'fund') = ("credit_entry"."user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "credit_funding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period" text NOT NULL,
	"seats" integer NOT NULL,
	"allowance_paise" integer NOT NULL,
	"required_paise" integer NOT NULL,
	"carried_paise" integer NOT NULL,
	"due_paise" integer NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"method" text,
	"reference" text,
	"recorded_by" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_funding_money_chk" CHECK ("credit_funding"."due_paise" >= 0 and "credit_funding"."required_paise" >= 0 and "credit_funding"."carried_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "finance_settings" ADD COLUMN "member_fee_bps" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "benefit_policy" ADD CONSTRAINT "benefit_policy_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_policy" ADD CONSTRAINT "benefit_policy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_funding_id_credit_funding_id_fk" FOREIGN KEY ("funding_id") REFERENCES "public"."credit_funding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_funding" ADD CONSTRAINT "credit_funding_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_funding" ADD CONSTRAINT "credit_funding_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_entry_org_idx" ON "credit_entry" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "credit_entry_user_idx" ON "credit_entry" USING btree ("user_id","period");--> statement-breakpoint
CREATE INDEX "credit_entry_ref_idx" ON "credit_entry" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_funding_period_uq" ON "credit_funding" USING btree ("org_id","period");
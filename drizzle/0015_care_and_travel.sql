CREATE TABLE "care_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"specialty" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"includes" text[] DEFAULT '{}' NOT NULL,
	"hospital_nights" integer DEFAULT 0 NOT NULL,
	"recovery_nights" integer DEFAULT 0 NOT NULL,
	"price_min_paise" integer NOT NULL,
	"price_max_paise" integer NOT NULL,
	"for_companies" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"requester_org_id" uuid,
	"status" text DEFAULT 'requested' NOT NULL,
	"package_id" uuid,
	"price_min_paise" integer,
	"price_max_paise" integer,
	"hospital_nights" integer,
	"earliest_date" date,
	"valid_until" date,
	"message" text DEFAULT '' NOT NULL,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"blob_path" text,
	"keep" boolean DEFAULT false NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_report_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_report_share" (
	"report_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"consent_text" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "care_report_share_report_id_org_id_pk" PRIMARY KEY("report_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "care_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"requester_org_id" uuid,
	"kind" text DEFAULT 'treatment' NOT NULL,
	"treatment" text NOT NULL,
	"specialty" text DEFAULT '' NOT NULL,
	"age_range" text,
	"headcount" integer,
	"travelling_from" text DEFAULT '' NOT NULL,
	"arrive_month" text,
	"companions" integer DEFAULT 0 NOT NULL,
	"needs" text[] DEFAULT '{}' NOT NULL,
	"interpreter_language" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_trip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"arrive_on" date,
	"depart_on" date,
	"stay_id" uuid,
	"checklist" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_trip_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "care_package" ADD CONSTRAINT "care_package_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_quote" ADD CONSTRAINT "care_quote_request_id_care_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."care_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_quote" ADD CONSTRAINT "care_quote_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_quote" ADD CONSTRAINT "care_quote_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_quote" ADD CONSTRAINT "care_quote_requester_org_id_organization_id_fk" FOREIGN KEY ("requester_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_quote" ADD CONSTRAINT "care_quote_package_id_care_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."care_package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_quote" ADD CONSTRAINT "care_quote_responded_by_user_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report" ADD CONSTRAINT "care_report_request_id_care_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."care_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report" ADD CONSTRAINT "care_report_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report_access" ADD CONSTRAINT "care_report_access_report_id_care_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."care_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report_access" ADD CONSTRAINT "care_report_access_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report_access" ADD CONSTRAINT "care_report_access_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report_access" ADD CONSTRAINT "care_report_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report_share" ADD CONSTRAINT "care_report_share_report_id_care_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."care_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report_share" ADD CONSTRAINT "care_report_share_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_report_share" ADD CONSTRAINT "care_report_share_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_request" ADD CONSTRAINT "care_request_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_request" ADD CONSTRAINT "care_request_requester_org_id_organization_id_fk" FOREIGN KEY ("requester_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_trip" ADD CONSTRAINT "care_trip_request_id_care_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."care_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_trip" ADD CONSTRAINT "care_trip_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_trip" ADD CONSTRAINT "care_trip_quote_id_care_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."care_quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_trip" ADD CONSTRAINT "care_trip_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_package_org_idx" ON "care_package" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "care_quote_request_org_uq" ON "care_quote" USING btree ("request_id","org_id");--> statement-breakpoint
CREATE INDEX "care_quote_org_idx" ON "care_quote" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "care_report_request_idx" ON "care_report" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "care_report_access_report_idx" ON "care_report_access" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "care_request_user_idx" ON "care_request" USING btree ("requester_user_id");
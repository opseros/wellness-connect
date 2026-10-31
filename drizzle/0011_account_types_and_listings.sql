CREATE TABLE "listing" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"rooms" integer,
	"max_guests" integer,
	"price_from_paise" integer,
	"features" text[] DEFAULT '{}' NOT NULL,
	"house_rules" text DEFAULT '' NOT NULL,
	"specialties" text[] DEFAULT '{}' NOT NULL,
	"accreditations" text[] DEFAULT '{}' NOT NULL,
	"accreditation_verified" boolean DEFAULT false NOT NULL,
	"beds" integer,
	"serves" text DEFAULT 'both' NOT NULL,
	"international_desk" boolean DEFAULT false NOT NULL,
	"visa_letter" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_note" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"blob_path" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"name" text NOT NULL,
	"blob_path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photo" ADD CONSTRAINT "listing_photo_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_document" ADD CONSTRAINT "org_document_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_document" ADD CONSTRAINT "org_document_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_document" ADD CONSTRAINT "org_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_kind_status_idx" ON "listing" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "listing_city_idx" ON "listing" USING btree ("city");--> statement-breakpoint
CREATE INDEX "listing_photo_org_idx" ON "listing_photo" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_document_org_idx" ON "org_document" USING btree ("org_id");
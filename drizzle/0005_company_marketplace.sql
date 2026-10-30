CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "gstin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "reschedule_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "cancelled_late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiry" ADD COLUMN "match_score" integer;--> statement-breakpoint
ALTER TABLE "enquiry" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "revision_note" text;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
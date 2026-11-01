ALTER TABLE "listing" ADD COLUMN "facility_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "amenities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "opening_hours" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "membership_from_paise" integer;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "drop_in_paise" integer;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "free_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "corporate_plans" boolean DEFAULT false NOT NULL;
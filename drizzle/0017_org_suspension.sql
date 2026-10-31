ALTER TABLE "organization" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "removed_at" timestamp with time zone;
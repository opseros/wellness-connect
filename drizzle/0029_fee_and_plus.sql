CREATE TABLE "plus_waitlist" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_settings" ADD COLUMN "plus_price_paise" integer DEFAULT 29900 NOT NULL;--> statement-breakpoint
ALTER TABLE "plus_waitlist" ADD CONSTRAINT "plus_waitlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
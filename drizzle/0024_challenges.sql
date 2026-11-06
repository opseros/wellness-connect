CREATE TABLE "challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"unit" text NOT NULL,
	"goal" integer NOT NULL,
	"daily_max" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"org_id" uuid,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_slug_unique" UNIQUE("slug"),
	CONSTRAINT "challenge_dates_chk" CHECK ("challenge"."ends_on" >= "challenge"."starts_on"),
	CONSTRAINT "challenge_goal_chk" CHECK ("challenge"."goal" > 0 and "challenge"."daily_max" > 0)
);
--> statement-breakpoint
CREATE TABLE "challenge_log" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"amount" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_log_challenge_id_user_id_day_pk" PRIMARY KEY("challenge_id","user_id","day"),
	CONSTRAINT "challenge_log_amount_chk" CHECK ("challenge_log"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "challenge_participant" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "challenge_participant_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_log" ADD CONSTRAINT "challenge_log_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_log" ADD CONSTRAINT "challenge_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participant" ADD CONSTRAINT "challenge_participant_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participant" ADD CONSTRAINT "challenge_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_org_idx" ON "challenge" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "challenge_dates_idx" ON "challenge" USING btree ("ends_on");--> statement-breakpoint
CREATE INDEX "challenge_participant_user_idx" ON "challenge_participant" USING btree ("user_id");
CREATE TABLE "follow" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "meetup_rsvp" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetup_rsvp_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "kind" text DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "space_key" text;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "kind" text DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "event_place" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "event_city" text;--> statement-breakpoint
ALTER TABLE "referral" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "referral" ADD COLUMN "client_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "referral" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_rsvp" ADD CONSTRAINT "meetup_rsvp_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_rsvp" ADD CONSTRAINT "meetup_rsvp_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_event" ADD CONSTRAINT "referral_event_referral_id_referral_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referral"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_event" ADD CONSTRAINT "referral_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_followee_idx" ON "follow" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "referral_event_idx" ON "referral_event" USING btree ("referral_id");--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_event_idx" ON "post" USING btree ("event_at");--> statement-breakpoint
CREATE INDEX "referral_to_idx" ON "referral" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "referral_from_idx" ON "referral" USING btree ("from_user_id");
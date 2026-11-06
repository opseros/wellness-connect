CREATE TABLE "buddy_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"activity" text NOT NULL,
	"low_answer" text,
	"high_answer" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buddy_match_order_chk" CHECK ("buddy_match"."user_low" < "buddy_match"."user_high")
);
--> statement-breakpoint
CREATE TABLE "buddy_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity" text NOT NULL,
	"city" text NOT NULL,
	"times" text[] NOT NULL,
	"pace" text DEFAULT 'steady' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meetup_checkin" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetup_checkin_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "circle_key" text;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "intro" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "open_to" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "buddy_match" ADD CONSTRAINT "buddy_match_user_low_user_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_match" ADD CONSTRAINT "buddy_match_user_high_user_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_request" ADD CONSTRAINT "buddy_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_checkin" ADD CONSTRAINT "meetup_checkin_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_checkin" ADD CONSTRAINT "meetup_checkin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buddy_match_pair_uq" ON "buddy_match" USING btree ("user_low","user_high","activity");--> statement-breakpoint
CREATE INDEX "buddy_match_high_idx" ON "buddy_match" USING btree ("user_high");--> statement-breakpoint
CREATE INDEX "buddy_request_match_idx" ON "buddy_request" USING btree ("activity","status");--> statement-breakpoint
CREATE UNIQUE INDEX "buddy_request_open_uq" ON "buddy_request" USING btree ("user_id","activity") WHERE "buddy_request"."status" = 'open';--> statement-breakpoint
CREATE INDEX "meetup_checkin_user_idx" ON "meetup_checkin" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_circle_key_unique" UNIQUE("circle_key");
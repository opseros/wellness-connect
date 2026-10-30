CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"platform_role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'company' NOT NULL,
	"domain" text,
	"domain_verified_at" timestamp with time zone,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"requires_credential" boolean DEFAULT true NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text DEFAULT '' NOT NULL,
	"blob_path" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_category" (
	"profile_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "professional_category_profile_id_category_id_pk" PRIMARY KEY("profile_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "professional_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"years_experience" integer DEFAULT 0 NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"delivery_modes" text[] DEFAULT '{}' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"discoverable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"delivery_modes" text[] DEFAULT '{}' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_min_paise" integer NOT NULL,
	"price_max_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"professional_user_id" uuid NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_proposal_id_unique" UNIQUE("proposal_id"),
	CONSTRAINT "booking_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "enquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"professional_user_id" uuid NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_id" uuid,
	"org_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matching_weights" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"weights" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payment_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payment_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"professional_user_id" uuid NOT NULL,
	"fee_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"proposed_start" timestamp with time zone NOT NULL,
	"max_participants" integer NOT NULL,
	"inclusions" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"free_cancellation_days" integer DEFAULT 7 NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"category_id" uuid NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"delivery_mode" text NOT NULL,
	"participants" integer NOT NULL,
	"budget_min_paise" integer NOT NULL,
	"budget_max_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"preferred_date" date,
	"must_be_verified" boolean DEFAULT true NOT NULL,
	"must_languages" text[] DEFAULT '{}' NOT NULL,
	"min_years_experience" integer DEFAULT 0 NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "block_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "connection_order_chk" CHECK ("connection"."user_low" < "connection"."user_high")
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participant" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_participant_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"privacy" text DEFAULT 'public' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_member_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "member_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"visibility" text DEFAULT 'members' NOT NULL,
	"messages_from_connections_only" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"group_id" uuid,
	"title" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_reaction" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reaction_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"note" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_category" ADD CONSTRAINT "professional_category_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_category" ADD CONSTRAINT "professional_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_profile" ADD CONSTRAINT "professional_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_proposal_id_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_professional_user_id_user_id_fk" FOREIGN KEY ("professional_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_professional_user_id_user_id_fk" FOREIGN KEY ("professional_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_professional_user_id_user_id_fk" FOREIGN KEY ("professional_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_low_user_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_high_user_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profile" ADD CONSTRAINT "member_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reaction" ADD CONSTRAINT "post_reaction_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reaction" ADD CONSTRAINT "post_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user_uq" ON "membership" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_domain_uq" ON "organization" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "credential_profile_idx" ON "credential" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "credential_status_idx" ON "credential" USING btree ("status");--> statement-breakpoint
CREATE INDEX "professional_city_idx" ON "professional_profile" USING btree ("city");--> statement-breakpoint
CREATE INDEX "service_profile_idx" ON "service" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "service_category_idx" ON "service" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "booking_org_idx" ON "booking" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "booking_pro_idx" ON "booking" USING btree ("professional_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enquiry_req_pro_uq" ON "enquiry" USING btree ("requirement_id","professional_user_id");--> statement-breakpoint
CREATE INDEX "ledger_booking_idx" ON "ledger_entry" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "proposal_req_idx" ON "proposal" USING btree ("requirement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_req_pro_uq" ON "proposal" USING btree ("requirement_id","professional_user_id");--> statement-breakpoint
CREATE INDEX "requirement_org_idx" ON "requirement" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "comment_post_idx" ON "comment" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_pair_uq" ON "connection" USING btree ("user_low","user_high");--> statement-breakpoint
CREATE INDEX "connection_high_idx" ON "connection" USING btree ("user_high");--> statement-breakpoint
CREATE INDEX "participant_user_idx" ON "conversation_participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_member_user_idx" ON "group_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_conversation_idx" ON "message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "post_author_idx" ON "post" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_group_idx" ON "post" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "post_created_idx" ON "post" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("processed_at","available_at");
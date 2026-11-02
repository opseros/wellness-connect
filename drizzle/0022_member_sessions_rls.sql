-- Member sessions belong to the member (member_user_id) and the professional
-- (pro_user_id). Platform staff, verified webhooks and the outbox use bypass.
ALTER TABLE "appointment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "appointment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY appointment_access ON "appointment"
  USING (app_bypass() OR member_user_id = app_user() OR pro_user_id = app_user())
  WITH CHECK (app_bypass() OR member_user_id = app_user() OR pro_user_id = app_user());

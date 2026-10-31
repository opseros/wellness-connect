-- Care & Travel holds health-related data. Each row is visible only to the
-- traveller (or their company for health check-ups), the hospitals they
-- chose, and platform jobs (bypass). Requester ids are copied onto quotes and
-- shares so no policy needs to look back at another protected table.
ALTER TABLE "care_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "care_request" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY care_request_access ON "care_request"
  USING (app_bypass() OR requester_user_id = app_user() OR requester_org_id = app_org()
         OR id IN (SELECT request_id FROM care_quote WHERE org_id = app_org()))
  WITH CHECK (app_bypass() OR requester_user_id = app_user());
--> statement-breakpoint
ALTER TABLE "care_quote" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "care_quote" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY care_quote_access ON "care_quote"
  USING (app_bypass() OR org_id = app_org() OR requester_user_id = app_user() OR requester_org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org() OR requester_user_id = app_user());
--> statement-breakpoint
ALTER TABLE "care_report_share" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "care_report_share" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY care_report_share_access ON "care_report_share"
  USING (app_bypass() OR owner_user_id = app_user() OR org_id = app_org())
  WITH CHECK (app_bypass() OR owner_user_id = app_user());
--> statement-breakpoint
ALTER TABLE "care_report" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "care_report" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY care_report_access_policy ON "care_report"
  USING (app_bypass() OR owner_user_id = app_user()
         OR id IN (SELECT report_id FROM care_report_share WHERE org_id = app_org() AND revoked_at IS NULL))
  WITH CHECK (app_bypass() OR owner_user_id = app_user());
--> statement-breakpoint
ALTER TABLE "care_report_access" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "care_report_access" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY care_report_access_read ON "care_report_access" FOR SELECT
  USING (app_bypass() OR owner_user_id = app_user() OR org_id = app_org());
--> statement-breakpoint
CREATE POLICY care_report_access_write ON "care_report_access" FOR INSERT
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint
-- The access log is evidence: no edits or deletes (reports cascade-delete only via bypass jobs).
CREATE TRIGGER care_report_access_no_update BEFORE UPDATE ON "care_report_access"
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
--> statement-breakpoint
ALTER TABLE "care_trip" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "care_trip" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY care_trip_access ON "care_trip"
  USING (app_bypass() OR owner_user_id = app_user())
  WITH CHECK (app_bypass() OR owner_user_id = app_user());

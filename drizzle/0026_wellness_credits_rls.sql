-- Wellness credits. Policy and funding belong to the company (app.org_id).
-- Credit entries are visible to the company (totals are computed in the
-- service; per-person rows are never shown to HR) and to the employee they
-- belong to. Platform staff, the outbox and verified webhooks use bypass.
ALTER TABLE "benefit_policy" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "benefit_policy" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY benefit_policy_access ON "benefit_policy"
  USING (app_bypass() OR org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint
ALTER TABLE "credit_funding" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_funding" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY credit_funding_access ON "credit_funding"
  USING (app_bypass() OR org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint
ALTER TABLE "credit_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY credit_entry_read ON "credit_entry" FOR SELECT
  USING (app_bypass() OR org_id = app_org() OR user_id = app_user());
--> statement-breakpoint
CREATE POLICY credit_entry_insert ON "credit_entry" FOR INSERT
  WITH CHECK (app_bypass() OR (org_id = app_org() AND (user_id IS NULL OR user_id = app_user())));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION credit_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'credit_entry is append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER credit_entry_no_update BEFORE UPDATE OR DELETE ON "credit_entry"
  FOR EACH ROW EXECUTE FUNCTION credit_entry_immutable();

-- Plan purchases belong to the facility (app.org_id) and the member (app.user_id).
ALTER TABLE "plan_purchase" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_purchase" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY plan_purchase_access ON "plan_purchase"
  USING (app_bypass() OR org_id = app_org() OR user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org() OR user_id = app_user());
--> statement-breakpoint
-- Team retreats: the company a stay is for can read it (in its own org scope).
CREATE POLICY stay_company_read ON "stay" FOR SELECT
  USING (company_org_id IS NOT NULL AND company_org_id = app_org());

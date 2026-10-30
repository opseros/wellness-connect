-- Requirements are company data. Only the owning company and professionals
-- who were sent an enquiry for that requirement can read it. (Before this,
-- any signed-in user could read published requirements.)
DROP POLICY requirement_access ON "requirement";
--> statement-breakpoint
CREATE POLICY requirement_access ON "requirement"
  USING (
    app_bypass()
    OR org_id = app_org()
    OR EXISTS (SELECT 1 FROM "enquiry" e WHERE e.requirement_id = "requirement".id AND e.professional_user_id = app_user())
  )
  WITH CHECK (app_bypass() OR org_id = app_org());

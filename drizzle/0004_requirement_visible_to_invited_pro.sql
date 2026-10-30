-- A professional who was sent an enquiry keeps seeing that requirement after it
-- closes (e.g. once a company accepts a proposal), so their enquiry inbox,
-- proposals and bookings still show what the work was.
DROP POLICY requirement_access ON "requirement";
--> statement-breakpoint
CREATE POLICY requirement_access ON "requirement"
  USING (
    app_bypass()
    OR org_id = app_org()
    OR (status = 'published' AND app_user() IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "enquiry" e WHERE e.requirement_id = "requirement".id AND e.professional_user_id = app_user())
  )
  WITH CHECK (app_bypass() OR org_id = app_org());

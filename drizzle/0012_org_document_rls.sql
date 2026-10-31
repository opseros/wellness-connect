-- Verification documents belong to their organisation: members see them only
-- inside withScope({ orgId }), and platform staff through audited bypass.
ALTER TABLE "org_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_document" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_document_access ON "org_document"
  USING (app_bypass() OR org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org());

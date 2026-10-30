-- Row-level security for tenant-owned marketplace data.
-- The app sets these per transaction with set_config(..., true), i.e. SET LOCAL,
-- which is safe behind Neon's transaction-mode connection pooler:
--   app.org_id  = the organization the user is acting for (or '')
--   app.user_id = the signed-in user (or '')
--   app.bypass  = 'on' only for platform jobs and platform admins
-- FORCE makes the policies apply to the table owner too (Neon's default role).

CREATE OR REPLACE FUNCTION app_org() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_bypass() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.bypass', true), '') = 'on' $$;
--> statement-breakpoint

ALTER TABLE "requirement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "requirement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY requirement_access ON "requirement"
  USING (app_bypass() OR org_id = app_org() OR (status = 'published' AND app_user() IS NOT NULL))
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint

ALTER TABLE "enquiry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "enquiry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Companies create enquiries; both sides can read and update their own.
CREATE POLICY enquiry_read ON "enquiry" FOR SELECT
  USING (app_bypass() OR org_id = app_org() OR professional_user_id = app_user());
--> statement-breakpoint
CREATE POLICY enquiry_insert ON "enquiry" FOR INSERT
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint
CREATE POLICY enquiry_update ON "enquiry" FOR UPDATE
  USING (app_bypass() OR org_id = app_org() OR professional_user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org() OR professional_user_id = app_user());
--> statement-breakpoint
CREATE POLICY enquiry_delete ON "enquiry" FOR DELETE
  USING (app_bypass() OR org_id = app_org());
--> statement-breakpoint

ALTER TABLE "proposal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "proposal" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY proposal_access ON "proposal"
  USING (app_bypass() OR org_id = app_org() OR professional_user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org() OR professional_user_id = app_user());
--> statement-breakpoint

ALTER TABLE "booking" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY booking_access ON "booking"
  USING (app_bypass() OR org_id = app_org() OR professional_user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint

ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_access ON "payment"
  USING (app_bypass() OR org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint

ALTER TABLE "ledger_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ledger_access ON "ledger_entry"
  USING (app_bypass() OR org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint

-- The ledger is append-only: corrections are new reversal rows.
CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'ledger_entry is append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
--> statement-breakpoint

-- Launch categories from the blueprint (section 18.2).
INSERT INTO "category" (slug, name, requires_credential) VALUES
  ('yoga-mindfulness', 'Yoga & mindfulness', true),
  ('stress-resilience', 'Stress management & resilience', true),
  ('corporate-nutrition', 'Corporate nutrition', true),
  ('workplace-ergonomics', 'Workplace ergonomics', true),
  ('executive-coaching', 'Executive coaching', false)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Illustrative weights from the blueprint (section 6.2); tune from real outcomes.
INSERT INTO "matching_weights" (id, weights) VALUES
  ('default', '{"expertise":25,"relevance":25,"credentials":15,"experience":15,"budget":10,"location":10}')
ON CONFLICT (id) DO NOTHING;

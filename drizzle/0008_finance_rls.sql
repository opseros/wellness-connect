-- Invoices and refunds belong to the company; payouts are visible to the
-- company and the professional who was paid, but only platform staff
-- (bypass) can record them.
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_access ON "invoice"
  USING (app_bypass() OR org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint
ALTER TABLE "refund" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "refund" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY refund_access ON "refund"
  USING (app_bypass() OR org_id = app_org())
  WITH CHECK (app_bypass() OR org_id = app_org());
--> statement-breakpoint
ALTER TABLE "payout" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payout" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payout_read ON "payout" FOR SELECT
  USING (app_bypass() OR org_id = app_org() OR professional_user_id = app_user());
--> statement-breakpoint
CREATE POLICY payout_write ON "payout" FOR INSERT
  WITH CHECK (app_bypass());
--> statement-breakpoint
-- Payouts are a financial record: no edits or deletes, like the ledger.
CREATE TRIGGER payout_no_update BEFORE UPDATE OR DELETE ON "payout"
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
--> statement-breakpoint
-- Default settings: 10% commission, 18% GST, no refund inside the free window,
-- 7-day payment terms. Seller details are filled in from the admin portal.
INSERT INTO "finance_settings" (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

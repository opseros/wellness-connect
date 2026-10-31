-- Stays belong to the host's organisation (app.org_id) and to the guest
-- (app.user_id). Platform staff, verified webhooks and the outbox use bypass.
ALTER TABLE "stay" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stay" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stay_access ON "stay"
  USING (app_bypass() OR org_id = app_org() OR guest_user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org() OR guest_user_id = app_user());
--> statement-breakpoint
ALTER TABLE "stay_payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stay_payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stay_payment_access ON "stay_payment"
  USING (app_bypass() OR org_id = app_org() OR guest_user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org() OR guest_user_id = app_user());
--> statement-breakpoint
ALTER TABLE "stay_invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stay_invoice" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stay_invoice_access ON "stay_invoice"
  USING (app_bypass() OR org_id = app_org() OR guest_user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org() OR guest_user_id = app_user());
--> statement-breakpoint
ALTER TABLE "stay_refund" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stay_refund" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stay_refund_access ON "stay_refund"
  USING (app_bypass() OR org_id = app_org() OR guest_user_id = app_user())
  WITH CHECK (app_bypass() OR org_id = app_org() OR guest_user_id = app_user());
--> statement-breakpoint
-- The ledger: guests may add their payment's rows but never read the split
-- (commission, host share); hosts read their own; staff see everything.
ALTER TABLE "stay_ledger_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stay_ledger_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stay_ledger_read ON "stay_ledger_entry" FOR SELECT
  USING (app_bypass() OR org_id = app_org());
--> statement-breakpoint
CREATE POLICY stay_ledger_write ON "stay_ledger_entry" FOR INSERT
  WITH CHECK (app_bypass() OR org_id = app_org() OR guest_user_id = app_user());
--> statement-breakpoint
CREATE TRIGGER stay_ledger_no_update BEFORE UPDATE OR DELETE ON "stay_ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
--> statement-breakpoint
ALTER TABLE "stay_payout" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stay_payout" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stay_payout_read ON "stay_payout" FOR SELECT
  USING (app_bypass() OR org_id = app_org());
--> statement-breakpoint
CREATE POLICY stay_payout_write ON "stay_payout" FOR INSERT
  WITH CHECK (app_bypass());
--> statement-breakpoint
CREATE TRIGGER stay_payout_no_update BEFORE UPDATE OR DELETE ON "stay_payout"
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

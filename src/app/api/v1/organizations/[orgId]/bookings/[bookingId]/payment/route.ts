import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getPaymentOptions } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

/** Price breakdown, payment status, invoices, refunds and whether online payment is available. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, bookingId } = await ctx.params;
  return getPaymentOptions((await requireUser(req.headers)).id, orgId, bookingId);
});

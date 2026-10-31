import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { requestInvoice } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

/** Pay by invoice: issues the tax invoice now; pay by bank transfer before the due date. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, bookingId } = await ctx.params;
  return requestInvoice((await requireUser(req.headers)).id, orgId, bookingId);
});

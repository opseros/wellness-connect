import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { startOnlinePayment } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

/** Creates (or reuses) a Razorpay order: { keyId, orderId, amountPaise, currency, prefill } for Checkout. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, bookingId } = await ctx.params;
  return startOnlinePayment(await requireUser(req.headers), orgId, bookingId);
});

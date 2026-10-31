import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { checkoutResultInput, confirmCheckout } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

/** Checkout success payload: { razorpay_order_id, razorpay_payment_id, razorpay_signature }. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId } = await ctx.params;
  return confirmCheckout(me.id, orgId, checkoutResultInput.parse(await readJson(req)));
});

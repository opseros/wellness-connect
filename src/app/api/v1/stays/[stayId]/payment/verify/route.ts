import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { confirmStayCheckout, stayCheckoutInput } from "@/modules/marketplace/stay-payments";

/** Checkout success: { razorpay_order_id, razorpay_payment_id, razorpay_signature }. Verified before anything changes. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return confirmStayCheckout(me.id, stayCheckoutInput.parse(await readJson(req)));
});

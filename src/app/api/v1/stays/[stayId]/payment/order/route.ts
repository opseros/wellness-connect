import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { startStayPayment } from "@/modules/marketplace/stay-payments";

type Ctx = { params: Promise<{ stayId: string }> };

/** Creates (or reuses) a Razorpay order for an accepted stay; returns what Checkout needs. */
export const POST = handle(async (req: Request, ctx: Ctx) => startStayPayment(await requireUser(req.headers), (await ctx.params).stayId));

import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { completeBooking } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, bookingId } = await ctx.params;
  return completeBooking((await requireUser(req.headers)).id, orgId, bookingId);
});

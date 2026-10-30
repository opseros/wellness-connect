import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { rescheduleBooking, rescheduleInput } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

/** { newStart: ISO date-time with offset, reason? } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, bookingId } = await ctx.params;
  return rescheduleBooking(me.id, orgId, bookingId, rescheduleInput.parse(await readJson(req)));
});

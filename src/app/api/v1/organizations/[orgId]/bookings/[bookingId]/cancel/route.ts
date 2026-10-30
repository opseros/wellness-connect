import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { cancelBooking, cancelInput } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

/** { reason } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, bookingId } = await ctx.params;
  return cancelBooking(me.id, orgId, bookingId, cancelInput.parse(await readJson(req)));
});

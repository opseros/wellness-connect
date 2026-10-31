import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { cancelInput, cancelStayAsGuest } from "@/modules/stays/service";

type Ctx = { params: Promise<{ stayId: string }> };

/** { reason } — free before payment; after payment refunded by the stay's cancellation policy. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return cancelStayAsGuest(me.id, (await ctx.params).stayId, cancelInput.parse(await readJson(req)));
});

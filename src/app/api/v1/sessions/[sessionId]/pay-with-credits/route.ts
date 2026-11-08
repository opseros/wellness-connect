import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { payWithCreditsInput, paySessionWithCredits } from "@/modules/marketplace/credits";

type Ctx = { params: Promise<{ sessionId: string }> };

/** { idempotencyKey }. Pays an accepted session in full with wellness credits; 409 when there isn't enough. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return paySessionWithCredits(me.id, (await ctx.params).sessionId, payWithCreditsInput.parse(await readJson(req)));
});

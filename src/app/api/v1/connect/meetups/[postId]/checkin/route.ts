import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { checkIn } from "@/modules/connect/service";

type Ctx = { params: Promise<{ postId: string }> };

/** "I'm here". Open from 30 minutes before the start until 4 hours after. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return checkIn(me.id, (await ctx.params).postId);
});

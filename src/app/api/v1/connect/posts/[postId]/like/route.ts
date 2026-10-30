import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { toggleLike } from "@/modules/connect/service";

type Ctx = { params: Promise<{ postId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return toggleLike(me.id, (await ctx.params).postId);
});

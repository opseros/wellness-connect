import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getPost } from "@/modules/connect/service";

type Ctx = { params: Promise<{ postId: string }> };

/** One post the caller may see. Its comments are at ./comments. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return getPost(me.id, (await ctx.params).postId);
});

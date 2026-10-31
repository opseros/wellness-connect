import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { addComment, commentInput, listComments } from "@/modules/connect/service";

type Ctx = { params: Promise<{ postId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => listComments((await requireUser(req.headers)).id, (await ctx.params).postId));

/** { body } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return addComment(me.id, (await ctx.params).postId, commentInput.parse(await readJson(req)));
});

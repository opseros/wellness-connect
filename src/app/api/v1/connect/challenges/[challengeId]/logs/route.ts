import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { logInput, logProgress } from "@/modules/connect/challenges";

type Ctx = { params: Promise<{ challengeId: string }> };

/** { day: "YYYY-MM-DD", amount }. Today or up to 2 days back; again to correct. Returns { total, completed, justCompleted }. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return logProgress(me.id, (await ctx.params).challengeId, logInput.parse(await readJson(req)));
});

import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getChallenge } from "@/modules/connect/challenges";

type Ctx = { params: Promise<{ slug: string }> };

/** One challenge with your daily log and the days you can still log. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return getChallenge(me.id, (await ctx.params).slug);
});

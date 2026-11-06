import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { joinChallenge, leaveChallenge } from "@/modules/connect/challenges";

type Ctx = { params: Promise<{ challengeId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return joinChallenge(me.id, (await ctx.params).challengeId);
});

/** Leave; deletes your numbers for this challenge. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return leaveChallenge(me.id, (await ctx.params).challengeId);
});

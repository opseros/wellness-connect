import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { followMember, unfollowMember } from "@/modules/connect/service";

type Ctx = { params: Promise<{ userId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  await followMember((await requireUser(req.headers)).id, (await ctx.params).userId);
  return { following: true };
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  await unfollowMember((await requireUser(req.headers)).id, (await ctx.params).userId);
  return { following: false };
});

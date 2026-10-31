import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { unblockMember } from "@/modules/connect/service";

type Ctx = { params: Promise<{ userId: string }> };

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  await unblockMember((await requireUser(req.headers)).id, (await ctx.params).userId);
  return { blocked: false };
});

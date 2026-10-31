import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { withdrawCareRequest } from "@/modules/care/service";

type Ctx = { params: Promise<{ requestId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  await withdrawCareRequest((await requireUser(req.headers)).id, (await ctx.params).requestId);
  return { withdrawn: true };
});

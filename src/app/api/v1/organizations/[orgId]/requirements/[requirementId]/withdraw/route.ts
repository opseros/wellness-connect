import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { withdrawRequirement } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; requirementId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, requirementId } = await ctx.params;
  return withdrawRequirement((await requireUser(req.headers)).id, orgId, requirementId);
});

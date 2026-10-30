import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { compareProposals } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; requirementId: string }> };

/** One column per professional who was sent an enquiry, with their proposal if any. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, requirementId } = await ctx.params;
  return compareProposals((await requireUser(req.headers)).id, orgId, requirementId);
});

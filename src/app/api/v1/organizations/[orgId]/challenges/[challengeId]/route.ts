import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { archiveCompanyChallenge } from "@/modules/connect/challenges";

type Ctx = { params: Promise<{ orgId: string; challengeId: string }> };

/** End and hide one of the company's challenges. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, challengeId } = await ctx.params;
  return archiveCompanyChallenge(me.id, orgId, challengeId);
});

import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { revokeReportShare } from "@/modules/care/service";

type Ctx = { params: Promise<{ reportId: string; orgId: string }> };

/** Withdraw consent: that hospital can't open the report any more. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { reportId, orgId } = await ctx.params;
  await revokeReportShare((await requireUser(req.headers)).id, reportId, orgId);
  return { shared: false };
});

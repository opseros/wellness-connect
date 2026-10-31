import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createHealthCheckRequest, healthCheckInput, listCompanyHealthChecks } from "@/modules/care/service";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => listCompanyHealthChecks((await requireUser(req.headers)).id, (await ctx.params).orgId));

/** Company buyers: { treatment, headcount, ageBand?, arriveMonth?, note?, hospitalIds[1..3] } — no individual health data. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return createHealthCheckRequest(me.id, (await ctx.params).orgId, healthCheckInput.parse(await readJson(req)));
});

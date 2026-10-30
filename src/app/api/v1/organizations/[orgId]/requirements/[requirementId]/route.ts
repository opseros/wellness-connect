import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getRequirement, requirementInput, updateRequirement } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; requirementId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, requirementId } = await ctx.params;
  return getRequirement((await requireUser(req.headers)).id, orgId, requirementId);
});

/** Full requirement body; { publish: true } publishes a draft. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, requirementId } = await ctx.params;
  return updateRequirement(me.id, orgId, requirementId, requirementInput.parse(await readJson(req)));
});

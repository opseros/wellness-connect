import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createRequirement, listOrgRequirements, requirementInput } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return listOrgRequirements(me.id, (await ctx.params).orgId);
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return createRequirement(me.id, (await ctx.params).orgId, requirementInput.parse(await readJson(req)));
});

import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listProposals, sendEnquiries } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; requirementId: string }> };
const body = z.object({ professionalUserIds: z.array(z.string().uuid()).min(1).max(20) });

/** { professionalUserIds: [...] } — each must pass every must-have. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, requirementId } = await ctx.params;
  return sendEnquiries(me.id, orgId, requirementId, body.parse(await readJson(req)).professionalUserIds);
});

/** Proposals received for this requirement. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, requirementId } = await ctx.params;
  return listProposals(me.id, orgId, requirementId);
});

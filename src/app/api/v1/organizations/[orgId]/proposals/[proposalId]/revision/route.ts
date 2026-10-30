import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { requestRevision, revisionInput } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; proposalId: string }> };

/** { note } — send the proposal back to the professional for changes. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, proposalId } = await ctx.params;
  return requestRevision(me.id, orgId, proposalId, revisionInput.parse(await readJson(req)));
});

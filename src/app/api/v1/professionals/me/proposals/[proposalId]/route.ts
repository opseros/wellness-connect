import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { proposalInput, reviseProposal } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ proposalId: string }> };

/** Send a revised proposal after the company asked for changes (same body as a new proposal). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return reviseProposal(me.id, (await ctx.params).proposalId, proposalInput.parse(await readJson(req)));
});

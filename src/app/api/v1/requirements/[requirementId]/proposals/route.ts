import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { submitProposal, proposalInput } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ requirementId: string }> };

/** A professional answers an enquiry they received. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return submitProposal(me.id, (await ctx.params).requirementId, proposalInput.parse(await readJson(req)));
});

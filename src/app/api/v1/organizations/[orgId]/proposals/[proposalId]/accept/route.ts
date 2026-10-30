import { handle } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { acceptProposal } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; proposalId: string }> };

/** Requires an Idempotency-Key header; retries with the same key return the same booking. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const key = req.headers.get("idempotency-key");
  if (!key) throw badRequest("Idempotency-Key header is required");
  const { orgId, proposalId } = await ctx.params;
  return acceptProposal(me.id, orgId, proposalId, key);
});

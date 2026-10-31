import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { removeDocument } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string; documentId: string }> };

/** Removes a document that is still waiting for review. Download it at /listing/<orgId>/documents/<documentId>. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, documentId } = await ctx.params;
  await removeDocument((await requireUser(req.headers)).id, orgId, documentId);
  return { removed: true };
});

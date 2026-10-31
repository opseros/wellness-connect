import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getOrgInvoice } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; invoiceId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, invoiceId } = await ctx.params;
  return getOrgInvoice((await requireUser(req.headers)).id, orgId, invoiceId);
});

import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { remindEnquiry } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; enquiryId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, enquiryId } = await ctx.params;
  await remindEnquiry((await requireUser(req.headers)).id, orgId, enquiryId);
  return { reminded: true };
});

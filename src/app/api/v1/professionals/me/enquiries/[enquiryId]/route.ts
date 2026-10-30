import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getMyEnquiry } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ enquiryId: string }> };

/** Opening an enquiry marks it viewed. */
export const GET = handle(async (req: Request, ctx: Ctx) => getMyEnquiry((await requireUser(req.headers)).id, (await ctx.params).enquiryId));

import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { declineEnquiry } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ enquiryId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => declineEnquiry((await requireUser(req.headers)).id, (await ctx.params).enquiryId));

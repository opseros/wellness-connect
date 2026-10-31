import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listHospitalQuotes } from "@/modules/care/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Hospital desk: quote requests (patient identity only after they accept your quote). */
export const GET = handle(async (req: Request, ctx: Ctx) => listHospitalQuotes((await requireUser(req.headers)).id, (await ctx.params).orgId));

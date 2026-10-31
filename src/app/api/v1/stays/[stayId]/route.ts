import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getMyStay } from "@/modules/stays/service";

type Ctx = { params: Promise<{ stayId: string }> };

/** One of my stays: status, price, invoices, refunds, what cancelling now would refund. */
export const GET = handle(async (req: Request, ctx: Ctx) => getMyStay((await requireUser(req.headers)).id, (await ctx.params).stayId));

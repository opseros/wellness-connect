import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listOrgBookings } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => listOrgBookings((await requireUser(req.headers)).id, (await ctx.params).orgId));

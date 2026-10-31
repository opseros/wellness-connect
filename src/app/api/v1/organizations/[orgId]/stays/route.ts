import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listHostStays } from "@/modules/stays/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Host: requests, awaiting payment, upcoming and past stays (guest first names only). */
export const GET = handle(async (req: Request, ctx: Ctx) => listHostStays((await requireUser(req.headers)).id, (await ctx.params).orgId));

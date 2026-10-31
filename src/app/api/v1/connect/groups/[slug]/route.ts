import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getGroup } from "@/modules/connect/service";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => getGroup((await requireUser(req.headers)).id, (await ctx.params).slug));

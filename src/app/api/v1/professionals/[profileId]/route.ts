import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getPublicProfile } from "@/modules/professionals/service";

type Ctx = { params: Promise<{ profileId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => getPublicProfile((await requireUser(req.headers)).id, (await ctx.params).profileId));

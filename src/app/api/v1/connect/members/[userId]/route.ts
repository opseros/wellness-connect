import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getMemberPage } from "@/modules/connect/service";

type Ctx = { params: Promise<{ userId: string }> };

/** A member's profile as I may see it (limited for non-connections), with canMessage and posts. */
export const GET = handle(async (req: Request, ctx: Ctx) => getMemberPage((await requireUser(req.headers)).id, (await ctx.params).userId));

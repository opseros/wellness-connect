import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { acceptInvitation } from "@/modules/organizations/service";

type Ctx = { params: Promise<{ token: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => acceptInvitation(await requireUser(req.headers), (await ctx.params).token));

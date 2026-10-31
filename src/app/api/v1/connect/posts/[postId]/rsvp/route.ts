import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { toggleRsvp } from "@/modules/connect/service";

type Ctx = { params: Promise<{ postId: string }> };

/** Toggle my RSVP to a meet-up. */
export const POST = handle(async (req: Request, ctx: Ctx) => toggleRsvp((await requireUser(req.headers)).id, (await ctx.params).postId));

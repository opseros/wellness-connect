import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { closeBuddyRequest } from "@/modules/connect/social";

type Ctx = { params: Promise<{ requestId: string }> };

/** Stop looking for a buddy for this activity. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return closeBuddyRequest(me.id, (await ctx.params).requestId);
});

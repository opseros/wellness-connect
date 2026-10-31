import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { removePhoto } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string; photoId: string }> };

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, photoId } = await ctx.params;
  await removePhoto((await requireUser(req.headers)).id, orgId, photoId);
  return { removed: true };
});

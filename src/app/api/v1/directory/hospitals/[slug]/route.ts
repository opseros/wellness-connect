import { handle } from "@/lib/api";
import { getCurrentUser } from "@/modules/identity/session";
import { getPublicListing } from "@/modules/listings/service";

type Ctx = { params: Promise<{ slug: string }> };

/** Public when verified; the hospital's own team can preview it. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await getCurrentUser(req.headers);
  return getPublicListing(me?.id ?? null, "hospital", (await ctx.params).slug);
});

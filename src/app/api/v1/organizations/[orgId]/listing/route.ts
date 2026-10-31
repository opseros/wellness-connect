import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getListingWorkspace, listingInput, updateListing } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Workspace: listing, documents (metadata only), photos, readiness checklist. Members only. */
export const GET = handle(async (req: Request, ctx: Ctx) => getListingWorkspace((await requireUser(req.headers)).id, (await ctx.params).orgId));

/** Owners and admins. Body: see listingInput (name, about, city, rooms, priceFromRupees, features[], specialties[], ...). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return updateListing(me.id, (await ctx.params).orgId, listingInput.parse(await readJson(req)));
});

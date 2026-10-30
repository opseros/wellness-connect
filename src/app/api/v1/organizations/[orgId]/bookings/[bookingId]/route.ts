import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getOrgBooking, locationInput, updateBookingLocation } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; bookingId: string }> };

/** Booking with its policy (what can be rescheduled or cancelled, and whether it's late). */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { orgId, bookingId } = await ctx.params;
  return getOrgBooking((await requireUser(req.headers)).id, orgId, bookingId);
});

/** { location } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, bookingId } = await ctx.params;
  return updateBookingLocation(me.id, orgId, bookingId, locationInput.parse(await readJson(req)));
});

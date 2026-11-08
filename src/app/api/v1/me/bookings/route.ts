import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listMyBookings } from "@/modules/bookings/service";

/** Everything you've booked (sessions, stays), upcoming first. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return listMyBookings(me.id);
});

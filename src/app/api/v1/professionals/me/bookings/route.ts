import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listMyBookings, summarizeEarnings } from "@/modules/marketplace/service";

/** { bookings, earnings } — earnings are agreed fees in paise until payments go live. */
export const GET = handle(async (req: Request) => {
  const bookings = await listMyBookings((await requireUser(req.headers)).id);
  return { bookings, earnings: summarizeEarnings(bookings) };
});

import { handle } from "@/lib/api";
import { quoteStay } from "@/modules/stays/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Public: ?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&rooms=1&guests=1 → { ok, price | reason }. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const u = new URL(req.url).searchParams;
  return quoteStay((await ctx.params).orgId, { checkIn: u.get("checkIn") ?? "", checkOut: u.get("checkOut") ?? "", rooms: u.get("rooms") ?? 1, guests: u.get("guests") ?? 1 });
});

import { handle } from "@/lib/api";
import { searchHomestays } from "@/modules/stays/service";

/** Public: verified homestays. ?q=&city=&feature=step_free|near_hospital|...&checkIn=&checkOut=&rooms= (dates → only those free). Photos at /media/listing-photos/<photoId>. */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const v = (k: string) => u.get(k) || undefined;
  return (await searchHomestays({ q: v("q"), city: v("city"), feature: v("feature") as never, checkIn: v("checkIn"), checkOut: v("checkOut"), rooms: v("rooms") })).rows;
});

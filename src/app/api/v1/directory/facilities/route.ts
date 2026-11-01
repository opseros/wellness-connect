import { handle } from "@/lib/api";
import { listDirectory } from "@/modules/listings/service";

/** Public: verified gyms, studios and wellness centres. ?q=&city=&type=&amenity= */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  return listDirectory("facility", {
    q: u.get("q") || undefined,
    city: u.get("city") || undefined,
    type: (u.get("type") || undefined) as never,
    amenity: (u.get("amenity") || undefined) as never,
  });
});

import { handle } from "@/lib/api";
import { listDirectory } from "@/modules/listings/service";
import { getCurrentUser } from "@/modules/identity/session";

/** Public: verified hospitals. ?q=&city=&specialty=&international=1 */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const me = await getCurrentUser(req.headers);
  return listDirectory("hospital", {
    q: u.get("q") || undefined,
    city: u.get("city") || undefined,
    specialty: u.get("specialty") || undefined,
    international: u.get("international") === "1" || undefined,
  }, me?.id ?? null);
});

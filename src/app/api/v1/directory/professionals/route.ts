import { handle } from "@/lib/api";
import { listProfessionalDirectory } from "@/modules/professionals/service";

/** Public: verified professionals. ?q=&city=&category=<slug> */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  return listProfessionalDirectory({ q: u.get("q") || undefined, city: u.get("city") || undefined, category: u.get("category") || undefined });
});

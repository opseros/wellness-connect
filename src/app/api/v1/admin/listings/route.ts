import { handle } from "@/lib/api";
import { requirePlatformStaff } from "@/modules/identity/session";
import { listListingQueue, type ListingQueueStatus } from "@/modules/admin/service";

/** Platform staff with MFA. ?status=pending|changes_requested|verified|rejected|draft|all */
export const GET = handle(async (req: Request) => {
  const staff = await requirePlatformStaff(req.headers);
  return listListingQueue(staff, (new URL(req.url).searchParams.get("status") || "pending") as ListingQueueStatus);
});

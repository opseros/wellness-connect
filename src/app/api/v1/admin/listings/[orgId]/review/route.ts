import { handle, readJson } from "@/lib/api";
import { requirePlatformStaff } from "@/modules/identity/session";
import { decideListing } from "@/modules/admin/service";
import { listingReviewInput } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Platform staff with MFA: { decision: "approved" | "changes_requested" | "rejected", note, checked: string[] }. Audited; owners emailed. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const staff = await requirePlatformStaff(req.headers);
  return decideListing(staff, (await ctx.params).orgId, listingReviewInput.parse(await readJson(req)));
});

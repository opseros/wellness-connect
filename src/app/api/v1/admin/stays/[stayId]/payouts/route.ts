import { handle, readJson } from "@/lib/api";
import { requirePlatformStaff } from "@/modules/identity/session";
import { adminRecordStayPayout } from "@/modules/admin/service";

type Ctx = { params: Promise<{ stayId: string }> };

/** Super admins: { amountRupees, reference, paidOn } — money sent to the host after check-in. Audited. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const staff = await requirePlatformStaff(req.headers);
  const b = (await readJson(req)) as { amountRupees: number; reference: string; paidOn: string };
  return adminRecordStayPayout(staff, (await ctx.params).stayId, b);
});

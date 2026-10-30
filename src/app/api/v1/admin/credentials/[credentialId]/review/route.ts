import { handle, readJson } from "@/lib/api";
import { requirePlatformStaff } from "@/modules/identity/session";
import { reviewCredential, reviewInput } from "@/modules/professionals/service";

type Ctx = { params: Promise<{ credentialId: string }> };

/** Platform staff with MFA: { decision: "approved" | "rejected" | "info_requested", note }. Audited. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const staff = await requirePlatformStaff(req.headers);
  return reviewCredential(staff.id, (await ctx.params).credentialId, reviewInput.parse(await readJson(req)));
});

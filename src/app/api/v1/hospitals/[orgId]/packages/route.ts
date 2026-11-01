import { handle } from "@/lib/api";
import { listPublicPackages } from "@/modules/care/service";
import { getCurrentUser } from "@/modules/identity/session";
import { assertHospitalsVisible } from "@/modules/platform/features";

type Ctx = { params: Promise<{ orgId: string }> };

/** Public: a verified hospital's active treatment packages (indicative prices in paise). 404 while hospitals are switched off. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await getCurrentUser(req.headers);
  await assertHospitalsVisible(me?.id);
  return listPublicPackages((await ctx.params).orgId);
});

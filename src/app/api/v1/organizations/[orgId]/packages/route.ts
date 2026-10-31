import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createPackage, listOwnPackages, packageInput } from "@/modules/care/service";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => listOwnPackages((await requireUser(req.headers)).id, (await ctx.params).orgId));

/** Hospital owners/admins: { title, specialty, description?, includes[], hospitalNights, recoveryNights, priceMinRupees, priceMaxRupees, forCompanies } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return createPackage(me.id, (await ctx.params).orgId, packageInput.parse(await readJson(req)));
});

import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getOrgForMember, orgSettingsInput, updateOrgSettings } from "@/modules/organizations/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** { org, role } for active members. */
export const GET = handle(async (req: Request, ctx: Ctx) => getOrgForMember((await requireUser(req.headers)).id, (await ctx.params).orgId));

/** Company settings (owners and admins): { name, city, address, billingEmail, gstin }. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return updateOrgSettings(me.id, (await ctx.params).orgId, orgSettingsInput.parse(await readJson(req)));
});

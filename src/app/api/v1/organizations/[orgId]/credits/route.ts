import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { companyCredits, policyInput, savePolicy } from "@/modules/marketplace/credits";

type Ctx = { params: Promise<{ orgId: string }> };

/** Owners, admins and wellness managers: policy, this month's prepayment and totals (never per person). */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return companyCredits(me.id, (await ctx.params).orgId);
});

/** { active, allowanceRupees, coverSessions, coverFacilities, partnersOnly }. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return savePolicy(me.id, (await ctx.params).orgId, policyInput.parse(await readJson(req)));
});

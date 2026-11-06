import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { challengeInput, companyChallenges, createCompanyChallenge } from "@/modules/connect/challenges";

type Ctx = { params: Promise<{ orgId: string }> };

/** Owners, admins and wellness managers: the company's challenges with team totals only. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return companyChallenges(me.id, (await ctx.params).orgId);
});

/** { title, about?, unit: "steps" | "minutes" | "km" | "days", goal, startsOn, endsOn }. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return createCompanyChallenge(me.id, (await ctx.params).orgId, challengeInput.parse(await readJson(req)));
});

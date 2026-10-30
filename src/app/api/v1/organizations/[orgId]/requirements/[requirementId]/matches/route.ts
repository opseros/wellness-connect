import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getMatches } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string; requirementId: string }> };

/** Ranked professionals with factor scores, plus excluded counts by reason. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, requirementId } = await ctx.params;
  const r = await getMatches(me.id, orgId, requirementId);
  const excludedByReason: Record<string, number> = {};
  for (const e of r.excluded) for (const reason of e.reasons) excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
  return {
    weights: r.weights,
    matches: r.matches.map((m) => ({
      professionalUserId: m.candidate.userId,
      name: m.candidate.name,
      headline: m.candidate.headline,
      city: m.candidate.city,
      yearsExperience: m.candidate.yearsExperience,
      score: m.score,
      factors: m.factors,
    })),
    excludedCount: r.excluded.length,
    excludedByReason,
  };
});

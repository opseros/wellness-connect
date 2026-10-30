// Deterministic, rule-based matching (blueprint section 6). Pure functions:
// no database, no I/O, so it is easy to test and to swap for a Phase 2
// hybrid engine behind the same interface.

export type DeliveryMode = "in_person" | "virtual" | "hybrid";

export type MatchRequirement = {
  categoryId: string;
  categoryRequiresCredential: boolean;
  city: string;
  deliveryMode: DeliveryMode;
  budgetMinPaise: number;
  budgetMaxPaise: number;
  mustBeVerified: boolean;
  mustLanguages: string[];
  minYearsExperience: number;
};

export type MatchCandidate = {
  userId: string;
  name: string;
  headline: string;
  city: string;
  discoverable: boolean;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  yearsExperience: number;
  languages: string[];
  deliveryModes: DeliveryMode[];
  categoryIds: string[];
  approvedCredentialCount: number;
  services: { categoryId: string; deliveryModes: DeliveryMode[]; priceMinPaise: number; priceMaxPaise: number; active: boolean }[];
};

export const FACTORS = ["expertise", "relevance", "credentials", "experience", "budget", "location"] as const;
export type Factor = (typeof FACTORS)[number];
export type Weights = Record<Factor, number>;

export const DEFAULT_WEIGHTS: Weights = { expertise: 25, relevance: 25, credentials: 15, experience: 15, budget: 10, location: 10 };

export type ExclusionReason =
  | "not_discoverable"
  | "not_in_category"
  | "not_verified"
  | "missing_credential"
  | "delivery_mode"
  | "location"
  | "language"
  | "experience";

export type RankedMatch = { candidate: MatchCandidate; score: number; factors: Record<Factor, number> };
export type MatchResult = {
  matches: RankedMatch[];
  excluded: { userId: string; reasons: ExclusionReason[] }[];
};

const norm = (s: string) => s.trim().toLowerCase();

function supports(modes: DeliveryMode[], wanted: DeliveryMode): boolean {
  if (wanted === "hybrid") return modes.includes("hybrid") || (modes.includes("in_person") && modes.includes("virtual"));
  return modes.includes(wanted) || modes.includes("hybrid");
}

/** Hard filters. A must-have can never be outweighed by a high score. */
export function exclusionReasons(req: MatchRequirement, c: MatchCandidate): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  const inCategory = c.categoryIds.includes(req.categoryId) || c.services.some((s) => s.active && s.categoryId === req.categoryId);
  if (!c.discoverable) reasons.push("not_discoverable");
  if (!inCategory) reasons.push("not_in_category");
  if (req.mustBeVerified && c.verificationStatus !== "verified") reasons.push("not_verified");
  if (req.categoryRequiresCredential && c.approvedCredentialCount === 0) reasons.push("missing_credential");
  if (!supports(c.deliveryModes, req.deliveryMode)) reasons.push("delivery_mode");
  if (req.deliveryMode !== "virtual" && req.city && norm(c.city) !== norm(req.city)) reasons.push("location");
  const langs = new Set(c.languages.map(norm));
  if (req.mustLanguages.some((l) => !langs.has(norm(l)))) reasons.push("language");
  if (c.yearsExperience < req.minYearsExperience) reasons.push("experience");
  return reasons;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function factorScores(req: MatchRequirement, c: MatchCandidate): Record<Factor, number> {
  const catServices = c.services.filter((s) => s.active && s.categoryId === req.categoryId);

  const expertise = catServices.length >= 2 ? 100 : catServices.length === 1 ? 85 : 60;

  const exactMode = catServices.some((s) => s.deliveryModes.includes(req.deliveryMode));
  const relevance = exactMode ? 100 : catServices.some((s) => supports(s.deliveryModes, req.deliveryMode)) ? 80 : 60;

  const credentials = c.approvedCredentialCount >= 2 ? 100 : c.approvedCredentialCount === 1 ? 80 : 40;

  const experience = clamp((c.yearsExperience / 10) * 100);

  let budget = 50;
  if (catServices.length) {
    const lo = Math.min(...catServices.map((s) => s.priceMinPaise));
    const hi = Math.max(...catServices.map((s) => s.priceMaxPaise));
    if (lo <= req.budgetMaxPaise && hi >= req.budgetMinPaise) budget = 100;
    else if (lo > req.budgetMaxPaise) budget = clamp(100 - ((lo - req.budgetMaxPaise) / Math.max(req.budgetMaxPaise, 1)) * 200);
    else budget = 90; // cheaper than the budget range
  }

  const sameCity = req.city !== "" && norm(c.city) === norm(req.city);
  const location = sameCity ? 100 : req.deliveryMode === "virtual" ? 80 : 50;

  return { expertise, relevance, credentials, experience, budget, location };
}

export function weightedScore(f: Record<Factor, number>, w: Weights): number {
  const total = FACTORS.reduce((s, k) => s + w[k], 0) || 1;
  return Math.round(FACTORS.reduce((s, k) => s + w[k] * f[k], 0) / total);
}

export function rankCandidates(req: MatchRequirement, candidates: MatchCandidate[], weights: Weights = DEFAULT_WEIGHTS): MatchResult {
  const matches: RankedMatch[] = [];
  const excluded: MatchResult["excluded"] = [];
  for (const c of candidates) {
    const reasons = exclusionReasons(req, c);
    if (reasons.length) {
      excluded.push({ userId: c.userId, reasons });
      continue;
    }
    const factors = factorScores(req, c);
    matches.push({ candidate: c, factors, score: weightedScore(factors, weights) });
  }
  // Ties broken by name so results are stable between requests.
  matches.sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
  return { matches, excluded };
}

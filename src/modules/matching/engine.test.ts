import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, rankCandidates, weightedScore, type MatchCandidate, type MatchRequirement } from "./engine";

const req: MatchRequirement = {
  categoryId: "cat-mind",
  categoryRequiresCredential: true,
  city: "Bengaluru",
  deliveryMode: "in_person",
  budgetMinPaise: 3_000_000,
  budgetMaxPaise: 5_000_000,
  mustBeVerified: true,
  mustLanguages: ["English"],
  minYearsExperience: 0,
};

const base = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  userId: "u1",
  name: "Ananya",
  headline: "",
  city: "Bengaluru",
  discoverable: true,
  verificationStatus: "verified",
  yearsExperience: 9,
  languages: ["English", "Kannada"],
  deliveryModes: ["in_person", "virtual"],
  categoryIds: ["cat-mind"],
  approvedCredentialCount: 2,
  services: [{ categoryId: "cat-mind", deliveryModes: ["in_person"], priceMinPaise: 3_500_000, priceMaxPaise: 4_500_000, active: true }],
  ...over,
});

describe("matching engine", () => {
  it("scores with the blueprint weights", () => {
    expect(weightedScore({ expertise: 95, relevance: 92, credentials: 100, experience: 90, budget: 85, location: 100 }, DEFAULT_WEIGHTS)).toBe(94);
  });

  it("hard filters can never be outweighed by score", () => {
    const strong = base({ userId: "unverified", verificationStatus: "pending", yearsExperience: 30 });
    const { matches, excluded } = rankCandidates(req, [strong]);
    expect(matches).toHaveLength(0);
    expect(excluded[0].reasons).toContain("not_verified");
  });

  it("explains every exclusion reason", () => {
    const c = base({ userId: "x", city: "Mumbai", languages: ["Hindi"], approvedCredentialCount: 0, deliveryModes: ["virtual"], categoryIds: [], services: [] });
    const { excluded } = rankCandidates({ ...req, minYearsExperience: 20 }, [c]);
    expect(excluded[0].reasons.sort()).toEqual(
      ["delivery_mode", "experience", "language", "location", "missing_credential", "not_in_category"].sort(),
    );
  });

  it("virtual requirements ignore city", () => {
    const c = base({ city: "Mumbai" });
    const { matches } = rankCandidates({ ...req, deliveryMode: "virtual" }, [c]);
    expect(matches).toHaveLength(1);
    expect(matches[0].factors.location).toBe(80);
  });

  it("ranks by score, then name for stable ties", () => {
    const a = base({ userId: "a", name: "Zed", yearsExperience: 2 });
    const b = base({ userId: "b", name: "Amy", yearsExperience: 10 });
    const c = base({ userId: "c", name: "Bob", yearsExperience: 10 });
    expect(rankCandidates(req, [a, b, c]).matches.map((m) => m.candidate.userId)).toEqual(["b", "c", "a"]);
  });

  it("penalises prices far above the budget", () => {
    const pricey = base({ services: [{ categoryId: "cat-mind", deliveryModes: ["in_person"], priceMinPaise: 10_000_000, priceMaxPaise: 12_000_000, active: true }] });
    expect(rankCandidates(req, [pricey]).matches[0].factors.budget).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  scoreCollegeForProfile,
  type ScorableCollege,
} from "@/lib/colleges/recommendation";

/**
 * Phase 4 exit criterion: two students with different profiles must get
 * different recommendations. These tests pin the scorer's personalization
 * so a regression back to "everyone gets the same list" fails loudly.
 */

const stanford: ScorableCollege = {
  sat_avg: 1500,
  act_avg: 34,
  state_region: "CA",
  net_price_avg: 18000,
  institution_type: "Private nonprofit",
  graduation_rate: 0.94,
  usnews_national_rank: 3,
};

const stateSchool: ScorableCollege = {
  sat_avg: 1150,
  act_avg: 24,
  state_region: "OH",
  net_price_avg: 15000,
  institution_type: "Public",
  graduation_rate: 0.65,
  usnews_national_rank: null,
};

describe("scoreCollegeForProfile", () => {
  it("gives different rankings to different profiles", () => {
    const highScorer = {
      sat_score: 1520,
      geographic_preferences: ["CA"],
      financial_aid_needed: false,
      target_school_type: "private",
    };
    const modestScorer = {
      sat_score: 1130,
      geographic_preferences: ["OH"],
      financial_aid_needed: true,
      target_school_type: "public",
    };

    const highAtStanford = scoreCollegeForProfile(highScorer, stanford).score;
    const highAtState = scoreCollegeForProfile(highScorer, stateSchool).score;
    const modestAtStanford = scoreCollegeForProfile(
      modestScorer,
      stanford,
    ).score;
    const modestAtState = scoreCollegeForProfile(
      modestScorer,
      stateSchool,
    ).score;

    // Each student's best match differs — personalization is alive.
    expect(highAtStanford).toBeGreaterThan(highAtState);
    expect(modestAtState).toBeGreaterThan(modestAtStanford);
  });

  it("credits SAT proximity in bands", () => {
    const base = { sat_avg: 1400 } as ScorableCollege;
    expect(scoreCollegeForProfile({ sat_score: 1420 }, base).score).toBe(30);
    expect(scoreCollegeForProfile({ sat_score: 1310 }, base).score).toBe(20);
    expect(scoreCollegeForProfile({ sat_score: 1260 }, base).score).toBe(10);
    expect(scoreCollegeForProfile({ sat_score: 1600 }, base).score).toBe(5);
    expect(scoreCollegeForProfile({ sat_score: 1100 }, base).score).toBe(0);
  });

  it("matches geography case-insensitively", () => {
    const college = { state_region: "MA" } as ScorableCollege;
    expect(
      scoreCollegeForProfile({ geographic_preferences: ["ma"] }, college)
        .score,
    ).toBe(15);
    expect(
      scoreCollegeForProfile({ geographic_preferences: ["NY"] }, college)
        .score,
    ).toBe(0);
  });

  it("only rewards affordability when aid is needed", () => {
    const cheap = { net_price_avg: 15000 } as ScorableCollege;
    expect(
      scoreCollegeForProfile({ financial_aid_needed: true }, cheap).score,
    ).toBe(10);
    expect(
      scoreCollegeForProfile({ financial_aid_needed: false }, cheap).score,
    ).toBe(0);
  });

  it("gives an empty profile only generic quality signals", () => {
    const { score, factors } = scoreCollegeForProfile(null, stanford);
    // Graduation rate (5) + top-25 rank (10): nothing personal.
    expect(score).toBe(15);
    expect(factors).toEqual(["High graduation rate", "Top 25 ranked"]);
  });
});

import { describe, it, expect } from "vitest";
import {
  classifyAdmissionOdds,
  computeListBalance,
  type AdmissionOdds,
} from "@/lib/colleges/recommendation";

describe("classifyAdmissionOdds (fix plan 10.8)", () => {
  it("returns null when nothing is known", () => {
    expect(classifyAdmissionOdds({ sat_score: 1400 }, {})).toBeNull();
    expect(classifyAdmissionOdds(null, {})).toBeNull();
  });

  it("highly selective schools are always a reach", () => {
    const stanford = { acceptance_rate: 0.04, sat_avg: 1500 };
    expect(classifyAdmissionOdds({ sat_score: 1600 }, stanford)).toBe("reach");
    expect(classifyAdmissionOdds(null, stanford)).toBe("reach");
  });

  it("scores well below the average lean reach", () => {
    expect(
      classifyAdmissionOdds(
        { sat_score: 1300 },
        { acceptance_rate: 0.5, sat_avg: 1400 }
      )
    ).toBe("reach");
  });

  it("scores near the average are a target", () => {
    expect(
      classifyAdmissionOdds(
        { sat_score: 1400 },
        { acceptance_rate: 0.5, sat_avg: 1400 }
      )
    ).toBe("target");
  });

  it("scores well above the average lean likely", () => {
    expect(
      classifyAdmissionOdds(
        { sat_score: 1500 },
        { acceptance_rate: 0.5, sat_avg: 1400 }
      )
    ).toBe("likely");
  });

  it("strong scores at a still-selective school stay a target", () => {
    expect(
      classifyAdmissionOdds(
        { sat_score: 1550 },
        { acceptance_rate: 0.2, sat_avg: 1450 }
      )
    ).toBe("target");
  });

  it("normalizes ACT deltas when SAT is missing", () => {
    expect(
      classifyAdmissionOdds(
        { act_score: 34 },
        { acceptance_rate: 0.5, act_avg: 30 }
      )
    ).toBe("likely");
    expect(
      classifyAdmissionOdds(
        { act_score: 27 },
        { acceptance_rate: 0.5, act_avg: 30 }
      )
    ).toBe("reach");
  });

  it("falls back to acceptance rate without scores", () => {
    expect(classifyAdmissionOdds(null, { acceptance_rate: 0.18 })).toBe(
      "reach"
    );
    expect(classifyAdmissionOdds(null, { acceptance_rate: 0.45 })).toBe(
      "target"
    );
    expect(classifyAdmissionOdds(null, { acceptance_rate: 0.75 })).toBe(
      "likely"
    );
  });
});

describe("computeListBalance", () => {
  it("counts categories and unclassified rows", () => {
    const balance = computeListBalance([
      "reach",
      "reach",
      "target",
      "likely",
      null,
    ]);
    expect(balance.reach).toBe(2);
    expect(balance.target).toBe(1);
    expect(balance.likely).toBe(1);
    expect(balance.unclassified).toBe(1);
    expect(balance.warnings).toEqual([]);
  });

  it("flags a list with no likely schools", () => {
    const balance = computeListBalance(["reach", "target", "target"]);
    expect(balance.warnings).toContain("No likely schools");
  });

  it("flags a reach-heavy list", () => {
    const odds: (AdmissionOdds | null)[] = [
      "reach",
      "reach",
      "reach",
      "reach",
      "target",
      "likely",
    ];
    expect(computeListBalance(odds).warnings).toContain("Reach-heavy list");
  });

  it("stays quiet on small lists", () => {
    expect(computeListBalance(["reach", "reach"]).warnings).toEqual([]);
    expect(computeListBalance([]).warnings).toEqual([]);
  });
});

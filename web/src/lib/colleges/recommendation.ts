import { usableFitPreference, type FitPreference } from "../interview/fit";

/**
 * Pure recommendation scoring (fix plan Phase 4.4). Extracted from the
 * queries layer so tests can prove that different profiles produce different
 * rankings. Deliberately rule-based — no LLM involved — and labeled as such
 * in the UI.
 */

export interface RecommendationProfile {
  sat_score?: number | null;
  act_score?: number | null;
  geographic_preferences?: string[] | null;
  financial_aid_needed?: boolean | null;
  target_school_type?: string | null;
}

export interface ScorableCollege {
  undergraduate_size?: number | null;
  locale_type?: string | null;
  sat_avg?: number | null;
  act_avg?: number | null;
  state_region?: string | null;
  net_price_avg?: number | null;
  institution_type?: string | null;
  graduation_rate?: number | null;
  usnews_national_rank?: number | null;
  usnews_liberal_arts_rank?: number | null;
}

// ---------------------------------------------------------------------------
// Reach / target / likely classification (fix plan 10.8)
// ---------------------------------------------------------------------------

export type AdmissionOdds = "reach" | "target" | "likely";

export interface ClassifiableCollege {
  acceptance_rate?: number | null;
  sat_avg?: number | null;
  act_avg?: number | null;
}

export const ODDS_LABELS: Record<AdmissionOdds, string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
};

/**
 * Rule-based classification of a student's admission odds at a college —
 * acceptance rate × test-score position. Deliberately conservative:
 * - Highly selective schools (<15% acceptance) are always a reach; test
 *   scores can't make Stanford "likely" for anyone.
 * - With scores: ≥ +80 SAT (or ≥ +2 ACT) above the college average leans
 *   likely; ≥ 60 SAT (1.5 ACT) below leans reach; between is a target.
 * - Without scores: acceptance rate alone (<25% reach, >60% likely).
 * Returns null when nothing is known about the college.
 */
export function classifyAdmissionOdds(
  profile: Pick<RecommendationProfile, "sat_score" | "act_score"> | null,
  college: ClassifiableCollege,
): AdmissionOdds | null {
  const rate = college.acceptance_rate ?? null;

  // Score position: prefer SAT, normalize ACT to an SAT-like delta (~30
  // SAT points per ACT point).
  let delta: number | null = null;
  if (profile?.sat_score && college.sat_avg) {
    delta = profile.sat_score - college.sat_avg;
  } else if (profile?.act_score && college.act_avg) {
    delta = (profile.act_score - college.act_avg) * 30;
  }

  if (rate == null && delta == null) return null;

  if (rate != null && rate < 0.15) return "reach";

  if (delta != null) {
    if (delta <= -60) return "reach";
    if (delta >= 80) {
      // Strong scores at a still-selective school stay a target.
      if (rate != null && rate < 0.25) return "target";
      return "likely";
    }
    return "target";
  }

  // Acceptance rate only.
  if (rate! < 0.25) return "reach";
  if (rate! > 0.6) return "likely";
  return "target";
}

export interface ListBalance {
  reach: number;
  target: number;
  likely: number;
  unclassified: number;
  /** Human-readable imbalance warnings; empty means balanced. */
  warnings: string[];
}

/** Aggregate a student's list and flag structural imbalance (10.8). */
export function computeListBalance(
  odds: (AdmissionOdds | null)[],
): ListBalance {
  const balance: ListBalance = {
    reach: 0,
    target: 0,
    likely: 0,
    unclassified: 0,
    warnings: [],
  };
  for (const o of odds) {
    if (o === null) balance.unclassified++;
    else balance[o]++;
  }
  const classified = balance.reach + balance.target + balance.likely;
  if (classified >= 3) {
    if (balance.likely === 0) {
      balance.warnings.push("No likely schools");
    }
    if (balance.target === 0) {
      balance.warnings.push("No target schools");
    }
    if (balance.reach > classified * 0.6) {
      balance.warnings.push("Reach-heavy list");
    }
  }
  return balance;
}

export function scoreCollegeForProfile(
  profile: RecommendationProfile | null,
  college: ScorableCollege,
): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // Test score match (SAT)
  const studentSAT = profile?.sat_score ?? null;
  const collegeSAT = college.sat_avg ?? null;
  if (studentSAT && collegeSAT) {
    const diff = Math.abs(studentSAT - collegeSAT);
    if (diff <= 50) {
      score += 30;
      factors.push("SAT score is an excellent match");
    } else if (diff <= 100) {
      score += 20;
      factors.push("SAT score is a good match");
    } else if (diff <= 150) {
      score += 10;
      factors.push("SAT score is within range");
    } else if (studentSAT > collegeSAT + 100) {
      score += 5;
      factors.push("SAT score exceeds average");
    }
  }

  // Test score match (ACT)
  const studentACT = profile?.act_score ?? null;
  const collegeACT = college.act_avg ?? null;
  if (studentACT && collegeACT) {
    const diff = Math.abs(studentACT - collegeACT);
    if (diff <= 1) {
      score += 30;
      factors.push("ACT score is an excellent match");
    } else if (diff <= 3) {
      score += 20;
      factors.push("ACT score is a good match");
    } else if (diff <= 5) {
      score += 10;
      factors.push("ACT score is within range");
    } else if (studentACT > collegeACT + 3) {
      score += 5;
      factors.push("ACT score exceeds average");
    }
  }

  // Geographic preference match
  const geoPrefs = profile?.geographic_preferences ?? [];
  if (geoPrefs.length > 0 && college.state_region) {
    if (
      geoPrefs.some(
        (p) => p.toLowerCase() === college.state_region!.toLowerCase(),
      )
    ) {
      score += 15;
      factors.push("Matches geographic preference");
    }
  }

  // Financial aid
  if (profile?.financial_aid_needed && college.net_price_avg) {
    if (college.net_price_avg < 20000) {
      score += 10;
      factors.push("Affordable net price");
    } else if (college.net_price_avg < 30000) {
      score += 5;
      factors.push("Moderate net price");
    }
  }

  // School type preference
  const targetType = profile?.target_school_type ?? null;
  if (targetType && college.institution_type) {
    if (
      college.institution_type.toLowerCase().includes(targetType.toLowerCase())
    ) {
      score += 10;
      factors.push("Matches preferred school type");
    }
  }

  // Graduation rate bonus
  if (college.graduation_rate && college.graduation_rate > 0.8) {
    score += 5;
    factors.push("High graduation rate");
  }

  // Ranking bonus
  const rank = college.usnews_national_rank ?? college.usnews_liberal_arts_rank;
  if (rank) {
    if (rank <= 25) {
      score += 10;
      factors.push("Top 25 ranked");
    } else if (rank <= 50) {
      score += 7;
      factors.push("Top 50 ranked");
    } else if (rank <= 100) {
      score += 4;
      factors.push("Top 100 ranked");
    }
  }

  return { score, factors };
}

export type InterviewFitComparison = {
  questionKey: string;
  answerId: string;
  revision: number;
  version: 2;
  criterion: string;
  importance: FitPreference["importance"];
  status:
    | "match"
    | "mismatch"
    | "unknown"
    | "flexible"
    | "uncertain"
    | "conflict";
  reason: string;
};
/** Explainable preference overlay; does not write to the manually maintained profile. */
export function scoreCollegeWithInterview(
  profile: RecommendationProfile | null,
  college: ScorableCollege,
  preferences: FitPreference[],
) {
  const direct = preferences.filter(
    (p) =>
      p.respondentKind === "student" &&
      ["size", "setting", "states", "type"].includes(p.criterion),
  );
  const overrides = (criterion: string) =>
    direct.some(
      (p) =>
        p.criterion === criterion &&
        ["Answered", "Flexible"].includes(p.status),
    );
  const effectiveProfile = profile
    ? {
        ...profile,
        ...(overrides("states") ? { geographic_preferences: [] } : {}),
        ...(overrides("type") ? { target_school_type: null } : {}),
      }
    : null;
  const base = scoreCollegeForProfile(effectiveProfile, college),
    comparisons: InterviewFitComparison[] = [];
  let score = base.score,
    requirementMismatches = 0;
  for (const p of direct) {
    const source = {
      questionKey: p.questionKey,
      answerId: p.answerId,
      revision: p.revision,
      version: p.version,
      criterion: p.criterion,
      importance: p.importance,
    };
    if (p.status === "Flexible") {
      comparisons.push({
        ...source,
        status: "flexible",
        reason: "Student is flexible; this criterion adds no ranking weight.",
      });
      continue;
    }
    if (!usableFitPreference(p)) {
      comparisons.push({
        ...source,
        status: "uncertain",
        reason: `${p.status}; no preference inferred and no ranking weight added.`,
      });
      continue;
    }
    let value: string | null = null;
    if (
      p.criterion === "size" &&
      college.undergraduate_size != null &&
      college.undergraduate_size > 0
    )
      value =
        college.undergraduate_size < 5000
          ? "small"
          : college.undergraduate_size <= 15000
            ? "medium"
            : "large";
    if (
      p.criterion === "setting" &&
      college.locale_type &&
      ["city", "suburb", "town", "rural"].includes(
        college.locale_type.toLowerCase(),
      )
    )
      value = college.locale_type.toLowerCase();
    if (p.criterion === "states" && college.state_region)
      value = college.state_region.toUpperCase();
    if (p.criterion === "type" && college.institution_type)
      value =
        college.institution_type === "Public"
          ? "public"
          : college.institution_type === "Private nonprofit"
            ? "private"
            : college.institution_type === "Private for-profit"
              ? "for_profit"
              : null;
    const weight =
      p.importance === "requirement"
        ? 20
        : p.importance === "important"
          ? 14
          : 8;
    if (value === null) {
      comparisons.push({
        ...source,
        status: "unknown",
        reason: `College ${p.criterion} data is unavailable; ${p.importance === "requirement" ? "requirement needs verification" : "no ranking adjustment"}.`,
      });
      continue;
    }
    const match = p.options.includes(value);
    score += match ? weight : -weight;
    if (!match && p.importance === "requirement") requirementMismatches++;
    comparisons.push({
      ...source,
      status: match ? "match" : "mismatch",
      reason: `${match ? "Matches" : "Does not match"} the student's ${p.criterion} ${p.importance === "requirement" ? "requirement" : "preference"} (${value}; ${match ? "+" : "−"}${weight}).`,
    });
    const manual =
      p.criterion === "states"
        ? (profile?.geographic_preferences ?? [])
        : p.criterion === "type" && profile?.target_school_type
          ? [profile.target_school_type.toLowerCase()]
          : [];
    if (
      manual.length &&
      !manual.some((v) =>
        p.options.some(
          (o) =>
            o.toLowerCase() === v.toLowerCase() ||
            v.toLowerCase().includes(o.toLowerCase()),
        ),
      )
    )
      comparisons.push({
        ...source,
        status: "conflict",
        reason:
          "This interview choice differs from the saved profile. The interview choice is used for this criterion; the profile remains unchanged. Confirm together.",
      });
  }
  return {
    score,
    factors: base.factors,
    fitComparisons: comparisons,
    requirementMismatches,
  };
}

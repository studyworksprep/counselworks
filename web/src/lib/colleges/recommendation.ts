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
  college: ClassifiableCollege
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
  odds: (AdmissionOdds | null)[]
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
  college: ScorableCollege
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
        (p) => p.toLowerCase() === college.state_region!.toLowerCase()
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

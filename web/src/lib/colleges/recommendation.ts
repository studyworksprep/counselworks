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

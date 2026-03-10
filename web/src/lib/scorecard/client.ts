/**
 * College Scorecard API client.
 * Docs: https://collegescorecard.ed.gov/data/documentation/
 */

const BASE_URL = "https://api.data.gov/ed/collegescorecard/v1/schools";

// Fields we pull for college research
const SCORECARD_FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.institutional_characteristics.level",
  "school.ownership",
  "school.locale",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.sat_scores.average.overall",
  "latest.admissions.act_scores.midpoint.cumulative",
  "latest.student.size",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.avg_net_price.overall",
  "latest.completion.rate_suppressed.overall",
  "latest.student.retention_rate_suppressed.overall",
  "latest.earnings.10_yrs_after_entry.median",
  "latest.aid.median_debt.completers.overall",
  "latest.aid.federal_loan_rate",
].join(",");

export interface ScorecardResult {
  id: number;
  "school.name": string;
  "school.city": string;
  "school.state": string;
  "school.ownership": number;
  "school.locale": number;
  "latest.admissions.admission_rate.overall": number | null;
  "latest.admissions.sat_scores.average.overall": number | null;
  "latest.admissions.act_scores.midpoint.cumulative": number | null;
  "latest.student.size": number | null;
  "latest.cost.tuition.in_state": number | null;
  "latest.cost.tuition.out_of_state": number | null;
  "latest.cost.avg_net_price.overall": number | null;
  "latest.completion.rate_suppressed.overall": number | null;
  "latest.student.retention_rate_suppressed.overall": number | null;
  "latest.earnings.10_yrs_after_entry.median": number | null;
  "latest.aid.median_debt.completers.overall": number | null;
  "latest.aid.federal_loan_rate": number | null;
}

interface ScorecardResponse {
  metadata: { total: number; page: number; per_page: number };
  results: ScorecardResult[];
}

function getApiKey(): string {
  const key = process.env.COLLEGE_SCORECARD_API_KEY;
  if (!key) throw new Error("COLLEGE_SCORECARD_API_KEY is not set");
  return key;
}

/**
 * Search for a school by name in the College Scorecard API.
 */
export async function searchScorecard(
  schoolName: string
): Promise<ScorecardResult[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", getApiKey());
  url.searchParams.set("school.name", schoolName);
  url.searchParams.set("fields", SCORECARD_FIELDS);
  url.searchParams.set("per_page", "5");

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) {
    console.error("Scorecard search failed:", res.status, await res.text());
    return [];
  }

  const json: ScorecardResponse = await res.json();
  return json.results ?? [];
}

/**
 * Get a school by its Scorecard (IPEDS) ID.
 */
export async function getScorecardById(
  scorecardId: number
): Promise<ScorecardResult | null> {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", getApiKey());
  url.searchParams.set("id", String(scorecardId));
  url.searchParams.set("fields", SCORECARD_FIELDS);

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) return null;

  const json: ScorecardResponse = await res.json();
  return json.results?.[0] ?? null;
}

/** Map Scorecard ownership code to human-readable type */
function ownershipLabel(code: number): string {
  switch (code) {
    case 1:
      return "Public";
    case 2:
      return "Private nonprofit";
    case 3:
      return "Private for-profit";
    default:
      return "Unknown";
  }
}

/** Map Scorecard locale code to human-readable type */
function localeLabel(code: number): string {
  if (code >= 11 && code <= 13) return "City";
  if (code >= 21 && code <= 23) return "Suburb";
  if (code >= 31 && code <= 33) return "Town";
  if (code >= 41 && code <= 43) return "Rural";
  return "Unknown";
}

/**
 * Convert a Scorecard result to the column values for our colleges table.
 */
export function scorecardToColumns(result: ScorecardResult) {
  return {
    scorecard_id: result.id,
    acceptance_rate:
      result["latest.admissions.admission_rate.overall"],
    sat_avg:
      result["latest.admissions.sat_scores.average.overall"],
    act_avg:
      result["latest.admissions.act_scores.midpoint.cumulative"],
    undergraduate_size: result["latest.student.size"],
    tuition_in_state: result["latest.cost.tuition.in_state"],
    tuition_out_state: result["latest.cost.tuition.out_of_state"],
    net_price_avg: result["latest.cost.avg_net_price.overall"],
    graduation_rate:
      result["latest.completion.rate_suppressed.overall"],
    retention_rate:
      result["latest.student.retention_rate_suppressed.overall"],
    earnings_median_10yr:
      result["latest.earnings.10_yrs_after_entry.median"],
    median_debt:
      result["latest.aid.median_debt.completers.overall"],
    federal_loan_rate: result["latest.aid.federal_loan_rate"],
    institution_type: ownershipLabel(result["school.ownership"]),
    locale_type: localeLabel(result["school.locale"]),
    scorecard_synced_at: new Date().toISOString(),
  };
}

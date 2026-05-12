/**
 * College Scorecard API client.
 * Docs: https://collegescorecard.ed.gov/data/documentation/
 */

const BASE_URL = "https://api.data.gov/ed/collegescorecard/v1/schools";

// Fields we pull for college research
const SCORECARD_FIELDS = [
  "id",
  "school.name",
  "school.alias",
  "school.school_url",
  "school.city",
  "school.state",
  "school.institutional_characteristics.level",
  "school.ownership",
  "school.locale",
  "school.degrees_awarded.predominant",
  "school.main_campus",
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
  "school.alias"?: string | null;
  "school.school_url"?: string | null;
  "school.city": string;
  "school.state": string;
  "school.ownership": number;
  "school.locale": number;
  "school.degrees_awarded.predominant"?: number;
  "school.main_campus"?: number;
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
 * Filter for the "Tight" ingest scope: 4-year (predominantly bachelor's),
 * non-profit (public or private nonprofit), main campus, undergrad ≥500.
 * Matches the scope decision in the bulk-ingest plan.
 */
export const TIGHT_INGEST_FILTERS: Record<string, string> = {
  "school.degrees_awarded.predominant": "3",
  "school.ownership": "1,2",
  "school.main_campus": "1",
  "latest.student.size__range": "500..",
};

/**
 * Walk the Scorecard catalog with filters, yielding pages. Caller decides
 * when to stop (e.g., for incremental processing or rate limiting).
 *
 * Generator pattern so the caller controls the cadence — Inngest steps wrap
 * each page so timeouts/retries scope to one page at a time.
 */
export async function* walkScorecardCatalog(
  filters: Record<string, string>,
  perPage = 100,
): AsyncGenerator<{ page: number; total: number; results: ScorecardResult[] }> {
  let page = 0;
  while (true) {
    const url = new URL(BASE_URL);
    url.searchParams.set("api_key", getApiKey());
    url.searchParams.set("fields", SCORECARD_FIELDS);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    for (const [k, v] of Object.entries(filters)) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(
        `Scorecard catalog walk failed at page ${page}: ${res.status}`,
      );
    }
    const json: ScorecardResponse = await res.json();
    const results = json.results ?? [];
    yield { page, total: json.metadata.total, results };

    if (results.length < perPage) return;
    if ((page + 1) * perPage >= json.metadata.total) return;
    page++;
  }
}

/**
 * Slugify a Scorecard institution name into the kind of URL fragment our
 * colleges.slug column holds. Lowercase, ASCII letters/digits/hyphens only.
 */
export function slugifyCollegeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Convert a Scorecard result to the *full* set of column values our colleges
 * table accepts, including the identity fields (name, slug, city, state,
 * website) used by the bulk ingest. The sync-job equivalent below is
 * narrower because syncs deliberately leave identity fields untouched.
 */
export function scorecardToFullColumns(result: ScorecardResult) {
  const url = result["school.school_url"]?.trim() || null;
  const normalizedUrl =
    url && !url.startsWith("http://") && !url.startsWith("https://")
      ? `https://${url}`
      : url;
  return {
    ...scorecardToColumns(result),
    name: result["school.name"],
    slug: slugifyCollegeName(result["school.name"]),
    city: result["school.city"] ?? null,
    state_region: result["school.state"] ?? null,
    country: "US",
    website_url: normalizedUrl,
  };
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

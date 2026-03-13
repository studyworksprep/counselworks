"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CollegeData {
  id: string;
  name: string;
  city: string | null;
  state_region: string | null;
  website_url: string | null;
  acceptance_rate: number | null;
  sat_avg: number | null;
  act_avg: number | null;
  undergraduate_size: number | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  net_price_avg: number | null;
  graduation_rate: number | null;
  retention_rate: number | null;
  earnings_median_10yr: number | null;
  median_debt: number | null;
  federal_loan_rate: number | null;
  institution_type: string | null;
  locale_type: string | null;
  usnews_national_rank: number | null;
  usnews_liberal_arts_rank: number | null;
  usnews_business_rank: number | null;
}

function pct(v: number | null) { return v == null ? "--" : `${(v * 100).toFixed(1)}%`; }
function usd(v: number | null) { return v == null ? "--" : `$${v.toLocaleString()}`; }
function num(v: number | null) { return v == null ? "--" : v.toLocaleString(); }

interface CompareRow {
  label: string;
  group: string;
  getValue: (c: CollegeData) => string;
  highlight?: "lower-better" | "higher-better";
}

const COMPARE_ROWS: CompareRow[] = [
  // Overview
  { label: "Location", group: "Overview", getValue: (c) => [c.city, c.state_region].filter(Boolean).join(", ") || "--" },
  { label: "Type", group: "Overview", getValue: (c) => c.institution_type ?? "--" },
  { label: "Setting", group: "Overview", getValue: (c) => c.locale_type ?? "--" },
  { label: "Enrollment", group: "Overview", getValue: (c) => num(c.undergraduate_size) },
  // Rankings
  { label: "US News National", group: "Rankings", getValue: (c) => c.usnews_national_rank ? `#${c.usnews_national_rank}` : "--", highlight: "lower-better" },
  { label: "US News LAC", group: "Rankings", getValue: (c) => c.usnews_liberal_arts_rank ? `#${c.usnews_liberal_arts_rank}` : "--", highlight: "lower-better" },
  { label: "US News Business", group: "Rankings", getValue: (c) => c.usnews_business_rank ? `#${c.usnews_business_rank}` : "--", highlight: "lower-better" },
  // Admissions
  { label: "Acceptance Rate", group: "Admissions", getValue: (c) => pct(c.acceptance_rate) },
  { label: "SAT Average", group: "Admissions", getValue: (c) => c.sat_avg ? String(c.sat_avg) : "--", highlight: "higher-better" },
  { label: "ACT Average", group: "Admissions", getValue: (c) => c.act_avg ? String(c.act_avg) : "--", highlight: "higher-better" },
  // Cost
  { label: "Tuition (In-State)", group: "Cost", getValue: (c) => usd(c.tuition_in_state), highlight: "lower-better" },
  { label: "Tuition (Out-of-State)", group: "Cost", getValue: (c) => usd(c.tuition_out_state), highlight: "lower-better" },
  { label: "Average Net Price", group: "Cost", getValue: (c) => usd(c.net_price_avg), highlight: "lower-better" },
  { label: "Median Debt", group: "Cost", getValue: (c) => usd(c.median_debt), highlight: "lower-better" },
  { label: "Federal Loan Rate", group: "Cost", getValue: (c) => pct(c.federal_loan_rate) },
  // Outcomes
  { label: "Graduation Rate", group: "Outcomes", getValue: (c) => pct(c.graduation_rate), highlight: "higher-better" },
  { label: "Retention Rate", group: "Outcomes", getValue: (c) => pct(c.retention_rate), highlight: "higher-better" },
  { label: "10yr Median Earnings", group: "Outcomes", getValue: (c) => usd(c.earnings_median_10yr), highlight: "higher-better" },
];

function getBestIndex(colleges: CollegeData[], row: CompareRow): number | null {
  if (!row.highlight) return null;

  const values = colleges.map((c) => {
    const str = row.getValue(c);
    if (str === "--") return null;
    const num = parseFloat(str.replace(/[$,%#]/g, "").replace(/,/g, ""));
    return isNaN(num) ? null : num;
  });

  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length < 2) return null;

  const best = row.highlight === "lower-better"
    ? Math.min(...validValues)
    : Math.max(...validValues);

  return values.indexOf(best);
}

export function CompareClient({ colleges }: { colleges: CollegeData[] }) {
  const router = useRouter();

  const groups = [...new Set(COMPARE_ROWS.map((r) => r.group))];

  return (
    <PageShell
      title="Compare Colleges"
      description={`Comparing ${colleges.length} colleges side by side`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/college-planning/discover")}>
            Back to Discover
          </Button>
        </div>
      }
    >
      {/* College names header */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-4 text-left font-medium text-gray-500 w-48 min-w-[12rem]">
                  Metric
                </th>
                {colleges.map((c) => (
                  <th key={c.id} className="px-4 py-4 text-left min-w-[10rem]">
                    <button
                      onClick={() => router.push(`/college-planning/${c.id}`)}
                      className="font-semibold text-primary-600 hover:text-primary-700 text-left"
                    >
                      {c.name}
                    </button>
                    <p className="text-xs text-gray-400 font-normal mt-0.5">
                      {[c.city, c.state_region].filter(Boolean).join(", ")}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const rows = COMPARE_ROWS.filter((r) => r.group === group);
                return (
                  <>
                    <tr key={`group-${group}`} className="bg-gray-50">
                      <td
                        colSpan={colleges.length + 1}
                        className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      >
                        {group}
                      </td>
                    </tr>
                    {rows.map((row) => {
                      const bestIdx = getBestIndex(colleges, row);
                      return (
                        <tr key={row.label} className="border-b border-gray-100">
                          <td className="px-4 py-3 font-medium text-gray-700">
                            {row.label}
                          </td>
                          {colleges.map((c, i) => (
                            <td
                              key={c.id}
                              className={`px-4 py-3 ${
                                bestIdx === i
                                  ? "text-green-700 font-semibold bg-green-50"
                                  : "text-gray-600"
                              }`}
                            >
                              {row.getValue(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}

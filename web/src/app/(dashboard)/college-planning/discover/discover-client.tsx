"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface CollegeRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state_region: string | null;
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
  institution_type: string | null;
  locale_type: string | null;
  usnews_national_rank: number | null;
  usnews_liberal_arts_rank: number | null;
  usnews_business_rank: number | null;
  scorecard_synced_at: string | null;
}

function pct(v: number | null) { return v == null ? "--" : `${(v * 100).toFixed(0)}%`; }
function usd(v: number | null) { return v == null ? "--" : `$${v.toLocaleString()}`; }

const sortOptions = [
  { value: "name", label: "Name (A-Z)" },
  { value: "acceptance_rate_asc", label: "Acceptance Rate (Low to High)" },
  { value: "acceptance_rate_desc", label: "Acceptance Rate (High to Low)" },
  { value: "sat_desc", label: "SAT Average (High to Low)" },
  { value: "tuition_asc", label: "Tuition (Low to High)" },
  { value: "graduation_desc", label: "Graduation Rate (High to Low)" },
  { value: "rank_asc", label: "US News Rank (Best First)" },
  { value: "earnings_desc", label: "10yr Earnings (High to Low)" },
];

export function DiscoverClient({
  colleges,
  states,
}: {
  colleges: CollegeRow[];
  states: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(true);
  const [compareList, setCompareList] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("name");

  const sorted = useMemo(() => {
    const list = [...colleges];
    switch (sortBy) {
      case "acceptance_rate_asc":
        return list.sort((a, b) => (a.acceptance_rate ?? 1) - (b.acceptance_rate ?? 1));
      case "acceptance_rate_desc":
        return list.sort((a, b) => (b.acceptance_rate ?? 0) - (a.acceptance_rate ?? 0));
      case "sat_desc":
        return list.sort((a, b) => (b.sat_avg ?? 0) - (a.sat_avg ?? 0));
      case "tuition_asc":
        return list.sort((a, b) => (a.tuition_out_state ?? 999999) - (b.tuition_out_state ?? 999999));
      case "graduation_desc":
        return list.sort((a, b) => (b.graduation_rate ?? 0) - (a.graduation_rate ?? 0));
      case "rank_asc":
        return list.sort((a, b) => {
          const ra = a.usnews_national_rank ?? a.usnews_liberal_arts_rank ?? 999;
          const rb = b.usnews_national_rank ?? b.usnews_liberal_arts_rank ?? 999;
          return ra - rb;
        });
      case "earnings_desc":
        return list.sort((a, b) => (b.earnings_median_10yr ?? 0) - (a.earnings_median_10yr ?? 0));
      default:
        return list;
    }
  }, [colleges, sortBy]);

  function toggleCompare(id: string) {
    setCompareList((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/college-planning/discover?${params.toString()}`);
  }

  function clearFilters() {
    router.push("/college-planning/discover");
  }

  function getRankLabel(c: CollegeRow) {
    if (c.usnews_national_rank) return `#${c.usnews_national_rank}`;
    if (c.usnews_liberal_arts_rank) return `#${c.usnews_liberal_arts_rank} LAC`;
    return null;
  }

  return (
    <PageShell
      title="Discover Colleges"
      description="Search and filter colleges by criteria"
      actions={
        <div className="flex gap-2">
          {compareList.size >= 2 && (
            <Button
              onClick={() =>
                router.push(
                  `/college-planning/compare?ids=${[...compareList].join(",")}`
                )
              }
            >
              Compare ({compareList.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/college-planning")}>
            Back to Planning
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Filters</h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent>
            <div className="space-y-4">
              {/* Row 1: Search + State + Type + Setting */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  label="College Name"
                  placeholder="Search by name..."
                  defaultValue={searchParams.get("search") ?? ""}
                  onBlur={(e) => updateFilter("search", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateFilter("search", (e.target as HTMLInputElement).value);
                  }}
                />
                <Select
                  label="State"
                  placeholder="Any state"
                  value={searchParams.get("state") ?? ""}
                  onChange={(e) => updateFilter("state", e.target.value)}
                  options={states.map((s) => ({ value: s, label: s }))}
                />
                <Select
                  label="School Type"
                  placeholder="Any type"
                  value={searchParams.get("institution_type") ?? ""}
                  onChange={(e) => updateFilter("institution_type", e.target.value)}
                  options={[
                    { value: "Public", label: "Public" },
                    { value: "Private nonprofit", label: "Private Nonprofit" },
                    { value: "Private for-profit", label: "Private For-Profit" },
                  ]}
                />
                <Select
                  label="Setting"
                  placeholder="Any setting"
                  value={searchParams.get("locale_type") ?? ""}
                  onChange={(e) => updateFilter("locale_type", e.target.value)}
                  options={[
                    { value: "City", label: "City" },
                    { value: "Suburb", label: "Suburb" },
                    { value: "Town", label: "Town" },
                    { value: "Rural", label: "Rural" },
                  ]}
                />
              </div>

              {/* Row 2: Test scores + Acceptance rate */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Input
                  label="SAT Min"
                  type="number"
                  placeholder="e.g. 1200"
                  defaultValue={searchParams.get("sat_min") ?? ""}
                  onBlur={(e) => updateFilter("sat_min", e.target.value)}
                />
                <Input
                  label="SAT Max"
                  type="number"
                  placeholder="e.g. 1500"
                  defaultValue={searchParams.get("sat_max") ?? ""}
                  onBlur={(e) => updateFilter("sat_max", e.target.value)}
                />
                <Input
                  label="ACT Min"
                  type="number"
                  placeholder="e.g. 25"
                  defaultValue={searchParams.get("act_min") ?? ""}
                  onBlur={(e) => updateFilter("act_min", e.target.value)}
                />
                <Input
                  label="ACT Max"
                  type="number"
                  placeholder="e.g. 34"
                  defaultValue={searchParams.get("act_max") ?? ""}
                  onBlur={(e) => updateFilter("act_max", e.target.value)}
                />
                <Input
                  label="Accept Rate Min"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 0.10"
                  defaultValue={searchParams.get("acceptance_rate_min") ?? ""}
                  onBlur={(e) => updateFilter("acceptance_rate_min", e.target.value)}
                />
                <Input
                  label="Accept Rate Max"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 0.50"
                  defaultValue={searchParams.get("acceptance_rate_max") ?? ""}
                  onBlur={(e) => updateFilter("acceptance_rate_max", e.target.value)}
                />
              </div>

              {/* Row 3: Cost, size, outcomes */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Input
                  label="Max Tuition (OOS)"
                  type="number"
                  placeholder="e.g. 50000"
                  defaultValue={searchParams.get("tuition_max") ?? ""}
                  onBlur={(e) => updateFilter("tuition_max", e.target.value)}
                />
                <Input
                  label="Min Enrollment"
                  type="number"
                  placeholder="e.g. 5000"
                  defaultValue={searchParams.get("enrollment_min") ?? ""}
                  onBlur={(e) => updateFilter("enrollment_min", e.target.value)}
                />
                <Input
                  label="Max Enrollment"
                  type="number"
                  placeholder="e.g. 30000"
                  defaultValue={searchParams.get("enrollment_max") ?? ""}
                  onBlur={(e) => updateFilter("enrollment_max", e.target.value)}
                />
                <Input
                  label="Min Grad Rate"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 0.80"
                  defaultValue={searchParams.get("graduation_rate_min") ?? ""}
                  onBlur={(e) => updateFilter("graduation_rate_min", e.target.value)}
                />
                <Input
                  label="Max US News Rank"
                  type="number"
                  placeholder="e.g. 50"
                  defaultValue={searchParams.get("usnews_rank_max") ?? ""}
                  onBlur={(e) => updateFilter("usnews_rank_max", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Results header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {sorted.length} college{sorted.length !== 1 && "s"} found
          {compareList.size > 0 && (
            <> &middot; {compareList.size} selected for comparison</>
          )}
        </p>
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          options={sortOptions}
          className="w-56"
        />
      </div>

      {/* Results table */}
      <Card>
        {sorted.length === 0 ? (
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              No colleges match your filters. Try adjusting your criteria.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-3 w-10" />
                  <th className="px-4 py-3 font-medium text-gray-500">College</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Location</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Rank</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Accept</th>
                  <th className="px-4 py-3 font-medium text-gray-500">SAT</th>
                  <th className="px-4 py-3 font-medium text-gray-500">ACT</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Tuition</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Net Price</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Grad Rate</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Size</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const rank = getRankLabel(c);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={compareList.has(c.id)}
                          onChange={() => toggleCompare(c.id)}
                          disabled={!compareList.has(c.id) && compareList.size >= 4}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          title="Select for comparison"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/college-planning/${c.id}`}
                          className="font-medium text-primary-600 hover:text-primary-700"
                        >
                          {c.name}
                        </Link>
                        <div className="flex gap-1 mt-0.5">
                          {c.institution_type && (
                            <span className="text-[10px] text-gray-400">{c.institution_type}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {[c.city, c.state_region].filter(Boolean).join(", ") || "--"}
                      </td>
                      <td className="px-4 py-3">
                        {rank ? (
                          <Badge variant="primary">{rank}</Badge>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{pct(c.acceptance_rate)}</td>
                      <td className="px-4 py-3 text-gray-600">{c.sat_avg ?? "--"}</td>
                      <td className="px-4 py-3 text-gray-600">{c.act_avg ?? "--"}</td>
                      <td className="px-4 py-3 text-gray-600">{usd(c.tuition_out_state)}</td>
                      <td className="px-4 py-3 text-gray-600">{usd(c.net_price_avg)}</td>
                      <td className="px-4 py-3 text-gray-600">{pct(c.graduation_rate)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.undergraduate_size?.toLocaleString() ?? "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}

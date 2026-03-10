"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { syncCollegeScorecard } from "@/lib/actions/colleges";

interface CollegeData {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state_region: string | null;
  country: string | null;
  website_url: string | null;
  application_platform: string | null;
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
  scorecard_synced_at: string | null;
}

function pct(value: number | null) {
  if (value == null) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function usd(value: number | null) {
  if (value == null) return "--";
  return `$${value.toLocaleString()}`;
}

function num(value: number | null) {
  if (value == null) return "--";
  return value.toLocaleString();
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-gray-400">{sublabel}</p>
      )}
    </div>
  );
}

export function CollegeDetailClient({ college }: { college: CollegeData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  function handleSync() {
    setSyncError(null);
    startTransition(async () => {
      const result = await syncCollegeScorecard(college.id);
      if (result.error) {
        setSyncError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const hasData = !!college.scorecard_synced_at;
  const syncDate = college.scorecard_synced_at
    ? new Date(college.scorecard_synced_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const location = [college.city, college.state_region]
    .filter(Boolean)
    .join(", ");

  return (
    <PageShell
      title={college.name}
      description={location || "College Research"}
      actions={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isPending}
          >
            {isPending
              ? "Syncing..."
              : hasData
                ? "Refresh Scorecard Data"
                : "Fetch Scorecard Data"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/college-planning")}
          >
            Back to List
          </Button>
        </div>
      }
    >
      {syncError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {syncError}
        </div>
      )}

      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">
              No College Scorecard data has been loaded for this school yet.
            </p>
            <Button onClick={handleSync} disabled={isPending}>
              {isPending ? "Fetching..." : "Fetch Data from College Scorecard"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
              <p className="text-xs text-gray-400">
                Data from College Scorecard &middot; Last synced {syncDate}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-6">
                {college.institution_type && (
                  <Badge variant="default">{college.institution_type}</Badge>
                )}
                {college.locale_type && (
                  <Badge variant="default">{college.locale_type}</Badge>
                )}
                {college.application_platform && (
                  <Badge variant="primary">
                    {college.application_platform}
                  </Badge>
                )}
                {college.website_url && (
                  <a
                    href={college.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:underline"
                  >
                    Website
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard
                  label="Acceptance Rate"
                  value={pct(college.acceptance_rate)}
                />
                <StatCard
                  label="Undergrad Size"
                  value={num(college.undergraduate_size)}
                />
                <StatCard
                  label="Graduation Rate"
                  value={pct(college.graduation_rate)}
                />
                <StatCard
                  label="Retention Rate"
                  value={pct(college.retention_rate)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Admissions */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">
                Admissions
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Acceptance Rate"
                  value={pct(college.acceptance_rate)}
                />
                <StatCard
                  label="Average SAT"
                  value={college.sat_avg ? String(college.sat_avg) : "--"}
                  sublabel="Composite"
                />
                <StatCard
                  label="Average ACT"
                  value={college.act_avg ? String(college.act_avg) : "--"}
                  sublabel="Composite midpoint"
                />
              </div>
            </CardContent>
          </Card>

          {/* Cost & Financial */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">
                Cost & Financial Aid
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard
                  label="Tuition (In-State)"
                  value={usd(college.tuition_in_state)}
                />
                <StatCard
                  label="Tuition (Out-of-State)"
                  value={usd(college.tuition_out_state)}
                />
                <StatCard
                  label="Avg Net Price"
                  value={usd(college.net_price_avg)}
                  sublabel="After financial aid"
                />
                <StatCard
                  label="Federal Loan Rate"
                  value={pct(college.federal_loan_rate)}
                  sublabel="% students with fed loans"
                />
                <StatCard
                  label="Median Debt"
                  value={usd(college.median_debt)}
                  sublabel="At graduation"
                />
              </div>
            </CardContent>
          </Card>

          {/* Outcomes */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Outcomes</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Graduation Rate"
                  value={pct(college.graduation_rate)}
                />
                <StatCard
                  label="Retention Rate"
                  value={pct(college.retention_rate)}
                  sublabel="First-year to second-year"
                />
                <StatCard
                  label="Median Earnings"
                  value={usd(college.earnings_median_10yr)}
                  sublabel="10 years after enrollment"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

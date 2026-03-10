"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";

interface CollegeListRow {
  id: string;
  category: string;
  round_type: string | null;
  intended_major: string | null;
  status: string;
  interest_level: number | null;
  student_id: string;
  student_name: string;
  college_id: string;
  college_name: string;
  college_slug: string;
  acceptance_rate: number | null;
  sat_avg: number | null;
  act_avg: number | null;
  undergraduate_size: number | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  graduation_rate: number | null;
  has_scorecard: boolean;
}

const categoryVariant: Record<
  string,
  "success" | "warning" | "danger" | "primary" | "default"
> = {
  likely: "success",
  target: "primary",
  reach: "warning",
  far_reach: "danger",
  safety: "success",
};

function pct(value: number | null) {
  if (value == null) return "--";
  return `${(value * 100).toFixed(0)}%`;
}

function usd(value: number | null) {
  if (value == null) return "--";
  return `$${value.toLocaleString()}`;
}

const columns: Column<CollegeListRow>[] = [
  {
    key: "college_name",
    header: "College",
    render: (row) => (
      <div>
        <span className="font-medium text-gray-900">{row.college_name}</span>
        {!row.has_scorecard && (
          <span className="ml-2 text-[10px] text-gray-400">No data</span>
        )}
      </div>
    ),
  },
  {
    key: "student_name",
    header: "Student",
    render: (row) => (
      <span className="text-gray-600">{row.student_name}</span>
    ),
  },
  {
    key: "category",
    header: "Category",
    render: (row) => (
      <Badge variant={categoryVariant[row.category] ?? "default"}>
        {row.category.replace("_", " ")}
      </Badge>
    ),
  },
  {
    key: "acceptance_rate",
    header: "Accept Rate",
    render: (row) => (
      <span className="text-gray-600 text-sm">{pct(row.acceptance_rate)}</span>
    ),
  },
  {
    key: "sat_avg",
    header: "SAT Avg",
    render: (row) => (
      <span className="text-gray-600 text-sm">
        {row.sat_avg ?? "--"}
      </span>
    ),
  },
  {
    key: "tuition_out_state",
    header: "Tuition (OOS)",
    render: (row) => (
      <span className="text-gray-600 text-sm">
        {usd(row.tuition_out_state)}
      </span>
    ),
  },
  {
    key: "graduation_rate",
    header: "Grad Rate",
    render: (row) => (
      <span className="text-gray-600 text-sm">
        {pct(row.graduation_rate)}
      </span>
    ),
  },
  {
    key: "round_type",
    header: "Round",
    render: (row) => (
      <span className="text-gray-600 text-xs uppercase">
        {row.round_type ?? "--"}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant="default">{row.status}</Badge>
    ),
  },
];

export function CollegePlanningClient({
  list,
}: {
  list: CollegeListRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/college-planning?${params.toString()}`);
  }

  return (
    <PageShell
      title="College Planning"
      description="Manage college lists across all students"
      actions={
        <Button onClick={() => router.push("/college-planning/add")}>
          Add to College List
        </Button>
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search colleges or students..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All categories"
              value={searchParams.get("category") ?? ""}
              onChange={(e) => updateFilter("category", e.target.value)}
              options={[
                { value: "likely", label: "Likely" },
                { value: "target", label: "Target" },
                { value: "reach", label: "Reach" },
                { value: "far_reach", label: "Far Reach" },
                { value: "safety", label: "Safety" },
              ]}
              className="w-40"
            />
            <span className="text-sm text-gray-500">
              {list.length} college{list.length !== 1 && "s"}
            </span>
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState
            title="No college lists yet"
            description="Start adding colleges to student lists to track applications and deadlines."
            actionLabel="Add to College List"
            onAction={() => router.push("/college-planning/add")}
          />
        ) : (
          <DataTable
            columns={columns}
            data={list}
            keyExtractor={(r) => r.id}
            onRowClick={(r) =>
              router.push(`/college-planning/${r.college_id}`)
            }
          />
        )}
      </Card>
    </PageShell>
  );
}

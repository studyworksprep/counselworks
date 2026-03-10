"use client";

import { useState } from "react";
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
  student_name: string;
  college_name: string;
  category: string;
  round_type: string | null;
  intended_major: string | null;
  deadline: string | null;
  application_status: string;
  essay_status: string;
  decision: string | null;
}

const categoryVariant: Record<string, "success" | "warning" | "danger" | "primary" | "default"> = {
  likely: "success",
  target: "primary",
  reach: "warning",
  far_reach: "danger",
  safety: "success",
};

const columns: Column<CollegeListRow>[] = [
  {
    key: "college_name",
    header: "College",
    render: (row) => (
      <span className="font-medium text-gray-900">{row.college_name}</span>
    ),
  },
  {
    key: "student_name",
    header: "Student",
  },
  {
    key: "category",
    header: "Category",
    render: (row) => (
      <Badge variant={categoryVariant[row.category] ?? "default"}>
        {row.category}
      </Badge>
    ),
  },
  {
    key: "round_type",
    header: "Round",
    render: (row) => (
      <span className="text-gray-600 uppercase text-xs">
        {row.round_type ?? "--"}
      </span>
    ),
  },
  {
    key: "intended_major",
    header: "Major",
    render: (row) => (
      <span className="text-gray-600">{row.intended_major ?? "--"}</span>
    ),
  },
  {
    key: "deadline",
    header: "Deadline",
    render: (row) => (
      <span className="text-gray-600">{row.deadline ?? "--"}</span>
    ),
  },
  {
    key: "application_status",
    header: "App Status",
    render: (row) => (
      <Badge variant="default">{row.application_status}</Badge>
    ),
  },
  {
    key: "decision",
    header: "Decision",
    render: (row) => (
      <span className="text-gray-600">{row.decision ?? "--"}</span>
    ),
  },
];

export default function CollegePlanningPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [roundFilter, setRoundFilter] = useState("");

  const data: CollegeListRow[] = [];

  return (
    <PageShell
      title="College Planning"
      description="Manage college lists across all students"
      actions={<Button>Add to College List</Button>}
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search colleges or students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All categories"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: "likely", label: "Likely" },
                { value: "target", label: "Target" },
                { value: "reach", label: "Reach" },
                { value: "far_reach", label: "Far Reach" },
                { value: "safety", label: "Safety" },
              ]}
              className="w-40"
            />
            <Select
              placeholder="All rounds"
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value)}
              options={[
                { value: "ea", label: "Early Action" },
                { value: "ed", label: "Early Decision" },
                { value: "ed2", label: "ED II" },
                { value: "rea", label: "REA" },
                { value: "rd", label: "Regular Decision" },
                { value: "rolling", label: "Rolling" },
              ]}
              className="w-44"
            />
          </div>
        </div>

        {data.length === 0 ? (
          <EmptyState
            title="No college lists yet"
            description="Start adding colleges to student lists to track applications and deadlines."
            actionLabel="Add to College List"
          />
        ) : (
          <DataTable
            columns={columns}
            data={data}
            keyExtractor={(r) => r.id}
          />
        )}
      </Card>
    </PageShell>
  );
}

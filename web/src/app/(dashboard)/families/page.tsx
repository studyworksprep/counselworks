"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";

interface FamilyRow {
  id: string;
  household_name: string;
  student_count: number;
  primary_contact: string | null;
  city: string | null;
  state_region: string | null;
}

const columns: Column<FamilyRow>[] = [
  {
    key: "household_name",
    header: "Household",
    render: (row) => (
      <span className="font-medium text-gray-900">{row.household_name}</span>
    ),
  },
  {
    key: "student_count",
    header: "Students",
    render: (row) => <span className="text-gray-600">{row.student_count}</span>,
  },
  {
    key: "primary_contact",
    header: "Primary Contact",
    render: (row) => (
      <span className="text-gray-600">{row.primary_contact ?? "--"}</span>
    ),
  },
  {
    key: "location",
    header: "Location",
    render: (row) => (
      <span className="text-gray-600">
        {[row.city, row.state_region].filter(Boolean).join(", ") || "--"}
      </span>
    ),
  },
];

export default function FamiliesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const families: FamilyRow[] = [];

  return (
    <PageShell
      title="Families"
      description="Manage family and household records"
      actions={
        <Button onClick={() => router.push("/families/new")}>
          Add Family
        </Button>
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <Input
            placeholder="Search families..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {families.length === 0 ? (
          <EmptyState
            title="No families yet"
            description="Add a family household to start linking students and parents."
            actionLabel="Add Family"
            onAction={() => router.push("/families/new")}
          />
        ) : (
          <DataTable
            columns={columns}
            data={families}
            keyExtractor={(f) => f.id}
            onRowClick={(f) => router.push(`/families/${f.id}`)}
          />
        )}
      </Card>
    </PageShell>
  );
}

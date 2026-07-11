"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
      <span className="text-gray-600">{row.primary_contact ?? "—"}</span>
    ),
  },
  {
    key: "location",
    header: "Location",
    render: (row) => (
      <span className="text-gray-600">
        {[row.city, row.state_region].filter(Boolean).join(", ") || "—"}
      </span>
    ),
  },
];

export function FamiliesClient({
  families,
  canCreate,
}: {
  families: FamilyRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/families?${params.toString()}`);
  }

  const showingArchived = searchParams.get("view") === "archived";

  return (
    <PageShell
      title="Families"
      description="Manage family and household records"
      actions={
        canCreate ? (
          <Button onClick={() => router.push("/families/new")}>
            Add Family
          </Button>
        ) : undefined
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search families..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => updateParam("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={searchParams.get("view") ?? ""}
              onChange={(e) => updateParam("view", e.target.value)}
              options={[
                { value: "", label: "Active households" },
                { value: "archived", label: "Archived households" },
              ]}
              className="w-52"
            />
          </div>
        </div>

        {families.length === 0 ? (
          <EmptyState
            title={showingArchived ? "No archived families" : "No families yet"}
            description={
              showingArchived
                ? "Households archived from their family page appear here."
                : canCreate
                  ? "Add a family household to start linking students and parents."
                  : "Families appear here once an owner or admin assigns their students to you."
            }
            actionLabel={canCreate && !showingArchived ? "Add Family" : undefined}
            onAction={
              canCreate && !showingArchived
                ? () => router.push("/families/new")
                : undefined
            }
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

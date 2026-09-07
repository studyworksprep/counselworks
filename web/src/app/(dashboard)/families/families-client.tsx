"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
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
    sortValue: (row) => row.household_name,
    render: (row) => (
      <span className="font-medium text-gray-900">{row.household_name}</span>
    ),
  },
  {
    // Derived from a join — not server-sortable (fix plan 11.1).
    key: "student_count",
    header: "Students",
    align: "right",
    render: (row) => <span className="text-gray-600">{row.student_count}</span>,
  },
  {
    // Derived from a join — not server-sortable.
    key: "primary_contact",
    header: "Primary Contact",
    render: (row) => (
      <span className="text-gray-600">{row.primary_contact ?? "—"}</span>
    ),
  },
  {
    // Sorts by city (a real column); state is shown alongside.
    key: "city",
    header: "Location",
    sortValue: (row) => [row.state_region, row.city].filter(Boolean).join(" "),
    render: (row) => (
      <span className="text-gray-600">
        {[row.city, row.state_region].filter(Boolean).join(", ") || "—"}
      </span>
    ),
  },
];

export function FamiliesClient({
  families,
  pagination,
  canCreate,
}: {
  families: FamilyRow[];
  pagination: { page: number; pageSize: number; total: number };
  canCreate: boolean;
}) {
  const router = useRouter();
  const { searchParams, setParam, setSearchParamDebounced, setParams } =
    useDebouncedFilter("/families");

  const showingArchived = searchParams.get("view") === "archived";
  const sortParam = searchParams.get("sort");
  const dirParam = searchParams.get("dir") === "desc" ? "desc" : "asc";

  return (
    <PageShell
      title="Families"
      description="Manage family and household records"
      actions={
        canCreate ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/students/import")}>
              Import CSV
            </Button>
            <Button onClick={() => router.push("/families/new")}>
              Add Family
            </Button>
          </div>
        ) : undefined
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search families..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) =>
                setSearchParamDebounced("search", e.target.value)
              }
              className="max-w-xs"
            />
            {/*
              No visible <label>, so this needs an explicit accessible name —
              axe reports a bare <select> as select-name at CRITICAL severity
              (caught by tests/e2e/a11y.spec.ts). A placeholder or a default
              option is not an accessible name.
            */}
            <Select
              aria-label="Filter households"
              value={searchParams.get("view") ?? ""}
              onChange={(e) => setParam("view", e.target.value)}
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
            server={{
              page: pagination.page,
              pageSize: pagination.pageSize,
              total: pagination.total,
              sort: sortParam
                ? { key: sortParam, dir: dirParam }
                : { key: "household_name", dir: "asc" },
              onPageChange: (p) => setParams({ page: String(p) }),
              onSortChange: (key, dir) =>
                setParams({ sort: key, dir, page: "" }),
            }}
          />
        )}
      </Card>
    </PageShell>
  );
}

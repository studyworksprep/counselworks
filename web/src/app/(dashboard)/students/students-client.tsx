"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import {
  STUDENT_STATUSES,
  STUDENT_STATUS_BADGES,
  STUDENT_STATUS_LABELS,
} from "@/lib/constants/students";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  graduation_year: number;
  school_name: string | null;
  status: string;
  counselor_name: string | null;
}

const columns: Column<StudentRow>[] = [
  {
    key: "name",
    header: "Student",
    sortValue: (row) => `${row.last_name} ${row.first_name}`,
    render: (row) => (
      <div className="flex items-center gap-3">
        <Avatar firstName={row.first_name} lastName={row.last_name} size="sm" />
        <div>
          <p className="font-medium text-gray-900">
            {row.first_name} {row.last_name}
          </p>
          {row.school_name && (
            <p className="text-xs text-gray-500">{row.school_name}</p>
          )}
        </div>
      </div>
    ),
  },
  {
    key: "graduation_year",
    header: "Class",
    align: "right",
    sortValue: (row) => row.graduation_year,
    render: (row) => <span className="text-gray-600">{row.graduation_year}</span>,
  },
  {
    key: "counselor_name",
    header: "Counselor",
    sortValue: (row) => row.counselor_name,
    render: (row) => (
      <span className="text-gray-600">{row.counselor_name ?? "Unassigned"}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortValue: (row) => row.status,
    render: (row) => (
      <Badge variant={STUDENT_STATUS_BADGES[row.status] ?? "default"}>
        {STUDENT_STATUS_LABELS[row.status] ?? row.status}
      </Badge>
    ),
  },
];

export function StudentsClient({
  students,
  canCreate,
}: {
  students: StudentRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const { searchParams, setParam, setSearchParamDebounced } =
    useDebouncedFilter("/students");

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => ({
    value: String(currentYear + i),
    label: `Class of ${currentYear + i}`,
  }));

  return (
    <PageShell
      title="Students"
      description="Manage your student roster"
      actions={
        canCreate ? (
          <Button onClick={() => router.push("/students/new")}>
            Add Student
          </Button>
        ) : undefined
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search students..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) =>
                setSearchParamDebounced("search", e.target.value)
              }
              className="max-w-xs"
            />
            <Select
              placeholder="All statuses"
              value={searchParams.get("status") ?? ""}
              onChange={(e) => setParam("status", e.target.value)}
              options={STUDENT_STATUSES.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
              className="w-40"
            />
            <Select
              placeholder="All years"
              value={searchParams.get("year") ?? ""}
              onChange={(e) => setParam("year", e.target.value)}
              options={yearOptions}
              className="w-44"
            />
          </div>
        </div>

        {students.length === 0 ? (
          <EmptyState
            title="No students yet"
            description={
              canCreate
                ? "Add your first student to get started with college counseling."
                : "Students appear here once an owner or admin assigns them to you."
            }
            actionLabel={canCreate ? "Add Student" : undefined}
            onAction={
              canCreate ? () => router.push("/students/new") : undefined
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={students}
            keyExtractor={(s) => s.id}
            onRowClick={(s) => router.push(`/students/${s.id}`)}
            initialSort={{ key: "name", dir: "asc" }}
          />
        )}
      </Card>
    </PageShell>
  );
}

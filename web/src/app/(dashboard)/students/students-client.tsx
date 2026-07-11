"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  graduation_year: number;
  school_name: string | null;
  status: string;
  counselor_name: string | null;
}

const statusVariant: Record<string, "success" | "warning" | "default" | "danger"> = {
  active: "success",
  paused: "warning",
  archived: "default",
  graduated: "success",
};

const columns: Column<StudentRow>[] = [
  {
    key: "name",
    header: "Student",
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
    render: (row) => <span className="text-gray-600">{row.graduation_year}</span>,
  },
  {
    key: "counselor_name",
    header: "Counselor",
    render: (row) => (
      <span className="text-gray-600">{row.counselor_name ?? "Unassigned"}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={statusVariant[row.status] ?? "default"}>
        {row.status}
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
  const searchParams = useSearchParams();

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => ({
    value: String(currentYear + i),
    label: `Class of ${currentYear + i}`,
  }));

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/students?${params.toString()}`);
  }

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
              onChange={(e) => updateFilter("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All statuses"
              value={searchParams.get("status") ?? ""}
              onChange={(e) => updateFilter("status", e.target.value)}
              options={[
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "archived", label: "Archived" },
                { value: "graduated", label: "Graduated" },
              ]}
              className="w-40"
            />
            <Select
              placeholder="All years"
              value={searchParams.get("year") ?? ""}
              onChange={(e) => updateFilter("year", e.target.value)}
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
          />
        )}
      </Card>
    </PageShell>
  );
}

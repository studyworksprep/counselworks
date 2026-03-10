"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  graduated: "primary" as "success",
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

export default function StudentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  const students: StudentRow[] = [];

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
        <Button onClick={() => router.push("/students/new")}>
          Add Student
        </Button>
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All statuses"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              options={yearOptions}
              className="w-44"
            />
          </div>
        </div>

        {students.length === 0 ? (
          <EmptyState
            title="No students yet"
            description="Add your first student to get started with college counseling."
            actionLabel="Add Student"
            onAction={() => router.push("/students/new")}
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

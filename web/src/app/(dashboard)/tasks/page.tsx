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

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  student_name: string | null;
  due_at: string | null;
  visibility_scope: string;
}

const priorityVariant: Record<string, "danger" | "warning" | "primary" | "default"> = {
  urgent: "danger",
  high: "warning",
  medium: "primary",
  low: "default",
};

const statusVariant: Record<string, "success" | "primary" | "warning" | "default"> = {
  completed: "success",
  in_progress: "primary",
  pending: "warning",
  cancelled: "default",
};

const columns: Column<TaskRow>[] = [
  {
    key: "title",
    header: "Task",
    render: (row) => (
      <span className="font-medium text-gray-900">{row.title}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={statusVariant[row.status] ?? "default"}>
        {row.status.replace("_", " ")}
      </Badge>
    ),
  },
  {
    key: "priority",
    header: "Priority",
    render: (row) => (
      <Badge variant={priorityVariant[row.priority] ?? "default"}>
        {row.priority}
      </Badge>
    ),
  },
  {
    key: "assigned_to",
    header: "Assigned To",
    render: (row) => (
      <span className="text-gray-600">{row.assigned_to ?? "Unassigned"}</span>
    ),
  },
  {
    key: "student_name",
    header: "Student",
    render: (row) => (
      <span className="text-gray-600">{row.student_name ?? "--"}</span>
    ),
  },
  {
    key: "due_at",
    header: "Due Date",
    render: (row) => (
      <span className="text-gray-600">{row.due_at ?? "--"}</span>
    ),
  },
];

export default function TasksPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"my" | "team" | "student">("my");

  const tasks: TaskRow[] = [];

  return (
    <PageShell
      title="Tasks"
      description="Track and manage tasks"
      actions={<Button>Create Task</Button>}
    >
      <div className="mb-6 flex items-center gap-2">
        {(["my", "team", "student"] as const).map((tab) => (
          <Button
            key={tab}
            variant={view === tab ? "primary" : "ghost"}
            size="sm"
            onClick={() => setView(tab)}
          >
            {tab === "my" ? "My Tasks" : tab === "team" ? "Team Tasks" : "Student Tasks"}
          </Button>
        ))}
      </div>

      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All statuses"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "pending", label: "Pending" },
                { value: "in_progress", label: "In Progress" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              className="w-40"
            />
          </div>
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            description="Create your first task to start tracking work for students and staff."
            actionLabel="Create Task"
          />
        ) : (
          <DataTable
            columns={columns}
            data={tasks}
            keyExtractor={(t) => t.id}
          />
        )}
      </Card>
    </PageShell>
  );
}

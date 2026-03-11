"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, isPast, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/modals/modal";
import { createTask, updateTaskStatus, deleteTask } from "@/lib/actions/tasks";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  priority: string;
  visibility_scope: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  assigned_to: string | null;
  assigned_user_id: string | null;
  student_name: string | null;
  student_id: string | null;
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

function formatDate(iso: string | null) {
  if (!iso) return "--";
  return format(parseISO(iso), "MMM d, yyyy");
}

function CreateTaskModal({
  open,
  onClose,
  students,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createTask(formData);
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Task"
      description="Add a new task for yourself or a team member"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Input name="title" label="Title *" required placeholder="e.g. Review essay draft" />

        <Input
          name="description"
          label="Description"
          placeholder="Optional details..."
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="priority"
            label="Priority"
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "urgent", label: "Urgent" },
            ]}
          />
          <Select
            name="task_type"
            label="Type"
            options={[
              { value: "general", label: "General" },
              { value: "follow_up", label: "Follow Up" },
              { value: "review", label: "Review" },
              { value: "deadline", label: "Deadline" },
              { value: "meeting_prep", label: "Meeting Prep" },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="assigned_user_id"
            label="Assign To"
            placeholder="Select staff member"
            options={staff.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            name="student_id"
            label="Related Student"
            placeholder="None"
            options={students.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        <Input name="due_at" label="Due Date" type="date" />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create Task"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TasksClient({
  tasks,
  students,
  staff,
}: {
  tasks: TaskRow[];
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [, startTransition] = useTransition();

  const view = (searchParams.get("view") as "my" | "team" | "student") ?? "my";

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/tasks?${params.toString()}`);
  }

  function handleStatusChange(taskId: string, status: string) {
    startTransition(async () => {
      await updateTaskStatus(taskId, status);
    });
  }

  function handleDelete(taskId: string) {
    startTransition(async () => {
      await deleteTask(taskId);
    });
  }

  const columns: Column<TaskRow>[] = [
    {
      key: "title",
      header: "Task",
      render: (row) => (
        <div>
          <span className="font-medium text-gray-900">{row.title}</span>
          {row.description && (
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
              {row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <select
          value={row.status}
          onChange={(e) => {
            e.stopPropagation();
            handleStatusChange(row.id, e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
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
      render: (row) => {
        const overdue =
          row.due_at &&
          isPast(parseISO(row.due_at)) &&
          !["completed", "cancelled"].includes(row.status);
        return (
          <span className={overdue ? "text-red-600 font-medium" : "text-gray-600"}>
            {formatDate(row.due_at)}
            {overdue && <span className="ml-1 text-xs">overdue</span>}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(row.id);
          }}
          className="text-gray-400 hover:text-red-500 text-xs"
        >
          Delete
        </button>
      ),
    },
  ];

  return (
    <PageShell
      title="Tasks"
      description="Track and manage tasks"
      actions={
        <Button onClick={() => setShowCreateModal(true)}>Create Task</Button>
      }
    >
      <div className="mb-6 flex items-center gap-2">
        {(["my", "team", "student"] as const).map((tab) => (
          <Button
            key={tab}
            variant={view === tab ? "primary" : "ghost"}
            size="sm"
            onClick={() => updateFilter("view", tab === "my" ? "" : tab)}
          >
            {tab === "my"
              ? "My Tasks"
              : tab === "team"
                ? "Team Tasks"
                : "Student Tasks"}
          </Button>
        ))}
      </div>

      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search tasks..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All statuses"
              value={searchParams.get("status") ?? ""}
              onChange={(e) => updateFilter("status", e.target.value)}
              options={[
                { value: "pending", label: "Pending" },
                { value: "in_progress", label: "In Progress" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              className="w-40"
            />
            <span className="text-sm text-gray-500">
              {tasks.length} task{tasks.length !== 1 && "s"}
            </span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            description="Create your first task to start tracking work for students and staff."
            actionLabel="Create Task"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <DataTable
            columns={columns}
            data={tasks}
            keyExtractor={(t) => t.id}
          />
        )}
      </Card>

      <CreateTaskModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        students={students}
        staff={staff}
      />
    </PageShell>
  );
}

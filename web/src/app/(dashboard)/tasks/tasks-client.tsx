"use client";
import { TASK_STATUS_OPTIONS, taskPriorityLabel } from "@/lib/constants/tasks";

import { TASK_STATUS_LABELS, normalizeTaskView } from "@/lib/constants/tasks";

import Link from "next/link";
import { taskPath } from "@/lib/constants/task-links";
import { TaskOwnerFields } from "@/components/tasks/owner-fields";
import { useState, useTransition } from "react";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { format, isPast, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { EmbeddedShell } from "@/components/layout/embedded-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { createTask, updateTaskStatus, deleteTask, resolvePendingTaskOwner } from "@/lib/actions/tasks";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_TYPE_OPTIONS,
  TASK_VISIBILITY_OPTIONS,
} from "@/lib/constants/tasks";
import type { RecurringTaskTemplateRow } from "@/lib/db/queries";
import { RecurringTasksCard } from "./recurring-tasks-client";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  priority: string;
  visibility_scope: string;
  due_at: string | null;
  due_on?: string | null;
  completed_at: string | null;
  completion_mode: string;
  dependency_blocked: boolean;
  needs_attention: boolean;
  created_at: string;
  owner_pending: boolean;
  owner_role: string | null;
  assigned_to: string | null;
  assigned_user_id: string | null;
  student_name: string | null;
  student_id: string | null;
  /** Set when the task was generated from a recurring template (13.3). */
  recurring_template_id: string | null;
  /** The occurrence date (firm-local YYYY-MM-DD) the task was generated for. */
  occurrence_on: string | null;
}

const priorityVariant: Record<string, "danger" | "warning" | "primary" | "default"> = {
  urgent: "danger",
  high: "warning",
  medium: "primary",
  low: "default",
};

function formatDate(iso: string | null) {
  if (!iso) return "--";
  return format(parseISO(iso), "MMM d, yyyy");
}

function CreateTaskModal({
  open,
  onClose,
  students,
  defaultStudentId,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  /** Pre-selected student (the student workspace, 13.0). */
  defaultStudentId?: string;
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
      description="Assign responsibility independently of who can see the task"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert>{error}</Alert>
        )}

        <Input name="title" label="Title" required placeholder="e.g. Review essay draft" />

        <Input
          name="description"
          label="Description"
          placeholder="Optional details..."
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="priority"
            label="Priority"
            defaultValue="medium"
            options={[...TASK_PRIORITY_OPTIONS]}
          />
          <Select
            name="task_type"
            label="Type"
            options={[...TASK_TYPE_OPTIONS]}
          />
        </div>

        <TaskOwnerFields students={students} defaultStudentId={defaultStudentId} />

        <Input name="due_at" label="Due Date" type="date" />

        <Select
          name="visibility_scope"
          label="Visible to"
          defaultValue={defaultStudentId ? "student" : "staff"}
          options={[...TASK_VISIBILITY_OPTIONS]}
        />
        <p className="-mt-2 text-xs text-gray-500">
          Student- and family-visible tasks appear in the portals and require
          a related student. Visibility does not grant permission to complete the task.
        </p>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            Create Task
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
  recurring,
  todayIso,
  students,
  staff,
  embed,
  reviewCount = 0,
}: {
  reviewCount?: number | null;
  tasks: TaskRow[];
  /** Recurring task templates for the same scope (fix plan 13.3). */
  recurring: RecurringTaskTemplateRow[];
  /** Today's date from the server, for the recurring form's start default. */
  todayIso: string;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  /**
   * Inside a student or family workspace (fix plan 13.0): filters push to
   * the workspace's own route, the my/team/student view tabs are hidden
   * (the list is already pinned), new tasks default to the student when
   * there is one, and the workspace layout provides the header.
   */
  embed?: { basePath: string; studentId?: string };
}) {
  const { searchParams, setParam, setSearchParamDebounced } =
    useDebouncedFilter(embed?.basePath ?? "/tasks");
  const Shell = embed ? EmbeddedShell : PageShell;
  const [pendingTask, setPendingTask] = useState<TaskRow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [, startTransition] = useTransition();
  const [writeError, setWriteError] = useState<string | null>(null);

  const view = normalizeTaskView(searchParams.get("view"));

  function handleStatusChange(taskId: string, status: string) {
    startTransition(async () => {
      const result = await updateTaskStatus(taskId, status);
      setWriteError(result.error ?? null);
    });
  }

  function handleDelete(taskId: string) {
    startTransition(async () => {
      const result = await deleteTask(taskId);
      setWriteError(result.error ?? null);
    });
  }

  const columns: Column<TaskRow>[] = [
    {
      key: "title",
      header: "Task",
      sortValue: (row) => row.title,
      render: (row) => (
        <div>
          <Link className="break-words font-medium text-gray-900 hover:underline" href={taskPath(row.id, "staff")}>{row.title}</Link>
          {row.owner_pending && <Button size="sm" variant="outline" onClick={() => setPendingTask(row)}>Resolve owner</Button>}
          {row.recurring_template_id && (
            <a
              href={`${embed?.basePath ?? "/tasks"}#recurring`}
              onClick={(e) => e.stopPropagation()}
              className="ml-2 inline-flex align-middle"
              title={`Generated from a recurring task${
                row.occurrence_on ? ` (occurrence ${formatDate(row.occurrence_on)})` : ""
              }`}
            >
              <Badge variant="outline">Recurring</Badge>
            </a>
          )}
          {row.description && (
            <p className="mt-0.5 line-clamp-2 max-w-xs break-words text-xs text-gray-500">
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
          disabled={row.owner_pending || row.completion_mode !== "simple" || row.dependency_blocked || row.needs_attention}
          aria-label={`Status for ${row.title}`}
          value={row.status}
          onChange={(e) => {
            e.stopPropagation();
            handleStatusChange(row.id, e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {Object.entries(TASK_STATUS_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (row) => (
        <Badge variant={priorityVariant[row.priority] ?? "default"}>
          {taskPriorityLabel(row.priority)}
        </Badge>
      ),
    },
    {
      key: "assigned_to",
      header: "Assigned To",
      render: (row) => (
        <span className="text-gray-600">{row.owner_pending ? `Awaiting ${row.owner_role ?? "owner"} — not published` : row.assigned_to ?? "Unassigned"}</span>
      ),
    },
    {
      key: "student_name",
      sortValue: (row) => row.student_name,
      header: "Student",
      render: (row) => (
        <span className="text-gray-600">{row.student_name ?? "--"}</span>
      ),
    },
    {
      key: "due_at",
      sortValue: (row) => row.due_at,
      header: "Due Date",
      render: (row) => {
        const overdue =
          row.due_at &&
          isPast(parseISO(row.due_at)) &&
          !["completed", "cancelled"].includes(row.status);
        return (
          <span className={overdue ? "text-danger-600 font-medium" : "text-gray-600"}>
            {formatDate(row.due_on || row.due_at)}
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
          className="text-gray-500 hover:text-danger-500 text-xs"
        >
          Delete
        </button>
      ),
    },
  ];

  return (
    <Shell
      title="Tasks"
      description="Track and manage tasks"
      actions={
        <>
          <Button variant="outline" onClick={() => setShowRecurringModal(true)}>
            New recurring task
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>Create Task</Button>
        </>
      }
    >
      {searchParams.get("work") === "workflow-week" && <p className="mb-4 text-sm">My actionable workflow tasks due today or in the next six days. <button className="underline" onClick={() => setParam("work", "")}>Clear workflow filter</button></p>}
      {writeError && <Alert>{writeError}</Alert>}
      {!embed && (
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["my", "team", "student"] as const).map((tab) => (
          <Button
            key={tab}
            variant={view === tab ? "primary" : "ghost"}
            size="sm"
            onClick={() => setParam("view", tab === "my" ? "" : tab)}
          >
            {tab === "my"
              ? "My Tasks"
              : tab === "team"
                ? "Team Tasks"
                : "Student Tasks"}
          </Button>
        ))}
        <Link href="/tasks/review" className="rounded px-3 py-2 text-sm font-semibold underline">{reviewCount === null ? "Review queue unavailable — try again" : `Needs review (${reviewCount})`}</Link>
      </div>
      )}

      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search tasks..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => setSearchParamDebounced("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              aria-label="Filter by status"
              placeholder="All statuses"
              value={searchParams.get("status") ?? ""}
              onChange={(e) => setParam("status", e.target.value)}
              options={TASK_STATUS_OPTIONS}
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
            responsiveCards
            columns={columns}
            data={tasks}
            keyExtractor={(t) => t.id}
          />
        )}
      </Card>

      <RecurringTasksCard
        templates={recurring}
        students={students}
        staff={staff}
        defaultStudentId={embed?.studentId}
        todayIso={todayIso}
        showCreate={showRecurringModal}
        onCloseCreate={() => setShowRecurringModal(false)}
      />

      {pendingTask && <Modal open onClose={() => setPendingTask(null)} title="Resolve owner and publish">
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await resolvePendingTaskOwner(pendingTask.id, String(data.get("assigned_user_id") || "") || null);
            setWriteError(result.error ?? null);
            if (!result.error) setPendingTask(null);
          });
        }}>
          <TaskOwnerFields students={students.filter(s => s.id === pendingTask.student_id)} defaultStudentId={pendingTask.student_id ?? ""}
            defaultUserId={pendingTask.assigned_user_id ?? ""} defaultRole={pendingTask.owner_role ?? "student"} />
          <p className="text-sm">Audience: {TASK_VISIBILITY_OPTIONS.find(o => o.value === pendingTask.visibility_scope)?.label}. Only the owner can complete portal work.</p>
          {searchParams.get("work") === "workflow-week" && <p className="mb-4 text-sm">My actionable workflow tasks due today or in the next six days. <button className="underline" onClick={() => setParam("work", "")}>Clear workflow filter</button></p>}
      {writeError && <Alert>{writeError}</Alert>}
          <Button type="submit">Resolve and publish</Button>
        </form>
      </Modal>}
      <CreateTaskModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        students={students}
        staff={staff}
        defaultStudentId={embed?.studentId}
      />
    </Shell>
  );
}

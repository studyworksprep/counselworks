"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { bulkApplyWorkflow, bulkCreateTasks } from "@/lib/actions/bulk";
import {
  STUDENT_STATUSES,
  STUDENT_STATUS_BADGES,
  STUDENT_STATUS_LABELS,
} from "@/lib/constants/students";
import { TASK_VISIBILITY_OPTIONS } from "@/lib/constants/tasks";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  graduation_year: number;
  school_name: string | null;
  status: string;
  counselor_name: string | null;
}

// ---------------------------------------------------------------------------
// Bulk operation modals (fix plan 10.8)
// ---------------------------------------------------------------------------
function BulkWorkflowModal({
  open,
  onClose,
  studentIds,
  templates,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  studentIds: string[];
  templates: { id: string; name: string }[];
  onDone: (summary: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const templateId = new FormData(e.currentTarget).get(
      "template_id"
    ) as string;
    if (!templateId) {
      setError("Choose a workflow");
      return;
    }
    startTransition(async () => {
      const result = await bulkApplyWorkflow(studentIds, templateId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("applied" in result) {
        const skipped = result.skipped ?? 0;
        const failed = result.failed ?? 0;
        const parts = [`Applied to ${result.applied} students`];
        if (skipped > 0) parts.push(`${skipped} already had it`);
        if (failed > 0) parts.push(`${failed} failed`);
        onDone(parts.join(" · "));
      }
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !isPending && onClose()}
      title={`Apply workflow to ${studentIds.length} students`}
      description="Students who already have this workflow active are skipped."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Select
          name="template_id"
          label="Workflow *"
          required
          placeholder="Choose a workflow"
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
        />
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            Apply Workflow
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BulkTaskModal({
  open,
  onClose,
  studentIds,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  studentIds: string[];
  onDone: (summary: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await bulkCreateTasks(studentIds, formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("created" in result) {
        onDone(`Task created for ${result.created} students`);
      }
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !isPending && onClose()}
      title={`Create a task for ${studentIds.length} students`}
      description="Each selected student gets their own copy of this task."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Input
          name="title"
          label="Title *"
          required
          placeholder="e.g. Send final transcript"
        />
        <Textarea name="description" label="Description" rows={2} />
        <div className="grid grid-cols-2 gap-4">
          <Input name="due_at" label="Due date" type="date" />
          <Select
            name="visibility_scope"
            label="Visibility"
            options={TASK_VISIBILITY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            Create Tasks
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function StudentsClient({
  students,
  canCreate,
  workflowTemplates = [],
}: {
  students: StudentRow[];
  canCreate: boolean;
  workflowTemplates?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { searchParams, setParam, setSearchParamDebounced } =
    useDebouncedFilter("/students");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => ({
    value: String(currentYear + i),
    label: `Class of ${currentYear + i}`,
  }));

  const allSelected =
    students.length > 0 && students.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)));
  }

  function handleBulkDone(summary: string) {
    setBulkResult(summary);
    setSelected(new Set());
    router.refresh();
  }

  const columns: Column<StudentRow>[] = [
    {
      key: "select",
      header: "",
      className: "w-10",
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={() => toggle(row.id)}
            aria-label={`Select ${row.first_name} ${row.last_name}`}
            className="h-4 w-4 rounded border-gray-300"
          />
        </span>
      ),
    },
    {
      key: "name",
      header: "Student",
      sortValue: (row) => `${row.last_name} ${row.first_name}`,
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar
            firstName={row.first_name}
            lastName={row.last_name}
            size="sm"
          />
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
      render: (row) => (
        <span className="text-gray-600">{row.graduation_year}</span>
      ),
    },
    {
      key: "counselor_name",
      header: "Counselor",
      sortValue: (row) => row.counselor_name,
      render: (row) => (
        <span className="text-gray-600">
          {row.counselor_name ?? "Unassigned"}
        </span>
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
      {bulkResult && (
        <Alert variant="success" className="mb-4">
          {bulkResult}
        </Alert>
      )}
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all students"
                className="h-4 w-4 rounded border-gray-300"
              />
              All
            </label>
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
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {selected.size} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowWorkflowModal(true)}
                >
                  Apply Workflow
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowTaskModal(true)}
                >
                  Create Task
                </Button>
              </div>
            )}
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

      <BulkWorkflowModal
        open={showWorkflowModal}
        onClose={() => setShowWorkflowModal(false)}
        studentIds={[...selected]}
        templates={workflowTemplates}
        onDone={handleBulkDone}
      />
      <BulkTaskModal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        studentIds={[...selected]}
        onDone={handleBulkDone}
      />
    </PageShell>
  );
}

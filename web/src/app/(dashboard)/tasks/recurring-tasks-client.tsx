"use client";

import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import {
  archiveRecurringTask,
  createRecurringTask,
  setRecurringTaskActive,
  updateRecurringTask,
} from "@/lib/actions/recurring-tasks";
import type { RecurringTaskTemplateRow } from "@/lib/db/queries";
import {
  TASK_CADENCE_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_TYPE_OPTIONS,
  TASK_VISIBILITY_OPTIONS,
} from "@/lib/constants/tasks";
import { WEEKDAY_LABELS } from "@/lib/constants/meetings";

/**
 * Recurring task templates (fix plan 13.3) — the staff-side card on the
 * Tasks page and inside the student / family workspaces. Every generated
 * occurrence is an ordinary task in the table above; the template only
 * decides what, for whom, how often, and who sees it.
 */

const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, i) => ({
  value: String(i),
  label,
}));

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function formatDay(iso: string | null) {
  if (!iso) return "--";
  return format(parseISO(iso), "MMM d, yyyy");
}

export function RecurringTaskModal({
  open,
  onClose,
  template,
  students,
  staff,
  defaultStudentId,
  todayIso,
}: {
  open: boolean;
  onClose: () => void;
  /** Editing an existing template: every field initialises from the row. */
  template?: RecurringTaskTemplateRow;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  defaultStudentId?: string;
  /** Today's date from the server (no Date in render). */
  todayIso: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [cadence, setCadence] = useState<string>(template?.cadence ?? "weekly");
  const [isPending, startTransition] = useTransition();
  const commitWrite = useWriteRefresh();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = template
        ? await updateRecurringTask(template.id, formData)
        : await createRecurringTask(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      commitWrite(onClose);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={template ? "Edit Recurring Task" : "New Recurring Task"}
      description="A task is created automatically on each occurrence"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Input
          name="title"
          label="Title"
          required
          defaultValue={template?.title ?? ""}
          placeholder="e.g. Weekly check-in"
        />

        <Input
          name="description"
          label="Description"
          defaultValue={template?.description ?? ""}
          placeholder="Optional details..."
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="cadence"
            label="Repeats"
            required
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            options={[...TASK_CADENCE_OPTIONS]}
          />
          {cadence === "monthly" ? (
            <Select
              name="day_of_month"
              label="Day of month"
              required
              defaultValue={String(template?.day_of_month ?? 1)}
              options={DAY_OF_MONTH_OPTIONS}
            />
          ) : (
            <Select
              name="weekday"
              label="Weekday"
              required
              defaultValue={String(template?.weekday ?? 1)}
              options={WEEKDAY_OPTIONS}
            />
          )}
        </div>

        <Input
          name="starts_on"
          label="Starts on"
          type="date"
          required
          defaultValue={template?.starts_on ?? todayIso}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="priority"
            label="Priority"
            defaultValue={template?.priority ?? "medium"}
            options={[...TASK_PRIORITY_OPTIONS]}
          />
          <Select
            name="task_type"
            label="Type"
            defaultValue={template?.task_type ?? "general"}
            options={[...TASK_TYPE_OPTIONS]}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="assigned_user_id"
            label="Assign To"
            placeholder="Student's primary counselor"
            defaultValue={template?.assigned_user_id ?? ""}
            options={staff.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            name="student_id"
            label="Related Student"
            placeholder="None"
            defaultValue={template?.student_id ?? defaultStudentId ?? ""}
            options={students.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        <Select
          name="visibility_scope"
          label="Visible to"
          defaultValue={template?.visibility_scope ?? "staff"}
          options={[...TASK_VISIBILITY_OPTIONS]}
        />
        <p className="-mt-2 text-xs text-gray-500">
          Each generated task is due at 9:00 AM on its date. Student- and
          family-visible tasks appear in the portals and require a related
          student.
        </p>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            {template ? "Save Recurring Task" : "Create Recurring Task"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RecurringTasksCard({
  templates,
  students,
  staff,
  defaultStudentId,
  todayIso,
  showCreate,
  onCloseCreate,
}: {
  templates: RecurringTaskTemplateRow[];
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  defaultStudentId?: string;
  todayIso: string;
  /** The "New recurring task" button lives in the page header. */
  showCreate: boolean;
  onCloseCreate: () => void;
}) {
  const [editing, setEditing] = useState<RecurringTaskTemplateRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const commitWrite = useWriteRefresh();

  function run(action: () => Promise<{ error?: string; success?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      commitWrite();
    });
  }

  return (
    <section id="recurring" className="mt-6">
    <Card>
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Recurring tasks</h2>
        <p className="text-sm text-gray-500">
          Templates that create a task on every occurrence. Generated tasks
          carry a Recurring badge in the list above.
        </p>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {templates.length === 0 ? (
        <p className="px-6 py-6 text-sm text-gray-500">
          No recurring tasks yet. Use &ldquo;New recurring task&rdquo; to set
          up a weekly or monthly reminder.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3">Task</th>
                <th className="px-6 py-3">Repeats</th>
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Assigned To</th>
                <th className="px-6 py-3">Next</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((t) => (
                <tr key={t.id} data-testid="recurring-task-row">
                  <td className="px-6 py-3">
                    <span className="font-medium text-gray-900">{t.title}</span>
                    <p className="text-xs text-gray-500">
                      {TASK_VISIBILITY_OPTIONS.find((o) => o.value === t.visibility_scope)
                        ?.label ?? t.visibility_scope}
                    </p>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{t.cadence_label}</td>
                  <td className="px-6 py-3 text-gray-600">{t.student_name ?? "--"}</td>
                  <td className="px-6 py-3 text-gray-600">
                    {t.assigned_to ?? "Primary counselor"}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {formatDay(t.next_occurrence_on)}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={t.active ? "success" : "default"}>
                      {t.active ? "Active" : "Paused"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        type="button"
                        className="text-primary-600 hover:underline"
                        onClick={() => setEditing(t)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-gray-600 hover:underline"
                        onClick={() =>
                          run(() => setRecurringTaskActive(t.id, !t.active))
                        }
                      >
                        {t.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        className="text-gray-500 hover:text-danger-500"
                        onClick={() => run(() => archiveRecurringTask(t.id))}
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <RecurringTaskModal
          key="create"
          open
          onClose={onCloseCreate}
          students={students}
          staff={staff}
          defaultStudentId={defaultStudentId}
          todayIso={todayIso}
        />
      )}
      {editing && (
        <RecurringTaskModal
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          template={editing}
          students={students}
          staff={staff}
          todayIso={todayIso}
        />
      )}
    </Card>
    </section>
  );
}

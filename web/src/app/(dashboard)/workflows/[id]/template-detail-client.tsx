"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modals/modal";
import {
  addTemplateStep,
  applyWorkflowToStudent,
  archiveWorkflowTemplate,
  deleteTemplateStep,
  reorderTemplateSteps,
  updateTemplateStep,
  updateWorkflowTemplate,
} from "@/lib/actions/workflows";
import type {
  WorkflowTemplateDetail,
  WorkflowTemplateStepRow,
} from "@/lib/db/queries";

const ROLE_OPTIONS = [
  { value: "counselor", label: "Counselor" },
  { value: "essay_coach", label: "Essay coach" },
  { value: "tutor", label: "Tutor" },
  { value: "student", label: "Student" },
  { value: "parent_guardian", label: "Parent / guardian" },
];

const VISIBILITY_OPTIONS = [
  { value: "staff", label: "Staff only" },
  { value: "student", label: "Visible to student" },
  { value: "family", label: "Visible to family" },
];

const STEP_TYPE_OPTIONS = [
  { value: "task", label: "Task" },
  { value: "milestone", label: "Milestone" },
  { value: "review", label: "Review" },
  { value: "deadline", label: "Deadline" },
];

interface Props {
  template: WorkflowTemplateDetail;
  students: { id: string; name: string }[];
}

export function TemplateDetailClient({ template, students }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState(template.steps);
  const [showEditTemplate, setShowEditTemplate] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [editingStep, setEditingStep] = useState<WorkflowTemplateStepRow | null>(null);
  const [, startTransition] = useTransition();

  const stepNamesById = useMemo(
    () => Object.fromEntries(steps.map((s) => [s.id, s.name])),
    [steps],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!template.is_editable) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(steps, oldIndex, newIndex);
    setSteps(next);

    startTransition(async () => {
      const result = await reorderTemplateSteps(
        template.id,
        next.map((s) => s.id),
      );
      if (result.error) {
        // Revert on error
        setSteps(steps);
      } else {
        router.refresh();
      }
    });
  }

  function handleDeleteStep(stepId: string) {
    if (!confirm("Delete this step?")) return;
    startTransition(async () => {
      const result = await deleteTemplateStep(stepId);
      if (!result.error) {
        setSteps((prev) => prev.filter((s) => s.id !== stepId));
        router.refresh();
      }
    });
  }

  async function handleArchive() {
    if (!confirm("Archive this template? It can no longer be applied to students.")) return;
    const result = await archiveWorkflowTemplate(template.id);
    if (!result.error) router.push("/workflows");
  }

  return (
    <PageShell
      title={template.name}
      description={template.description ?? "Workflow template"}
      actions={
        <div className="flex flex-wrap gap-2">
          {template.is_editable && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowEditTemplate(true)}
              >
                Edit
              </Button>
              {template.is_active && (
                <Button variant="outline" onClick={handleArchive}>
                  Archive
                </Button>
              )}
            </>
          )}
          {template.instantiation_scope === "student_college" ? (
            <Button variant="outline" disabled title="Per-college templates are applied from a student's college list">
              Per-college template
            </Button>
          ) : (
            <Button
              onClick={() => setShowApply(true)}
              disabled={steps.length === 0 || !template.is_active}
            >
              Apply to student
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="primary">{template.workflow_type}</Badge>
        {template.grade_level && (
          <Badge variant="default">{template.grade_level}</Badge>
        )}
        {template.category && <Badge variant="default">{template.category}</Badge>}
        {template.instantiation_scope === "student_college" && (
          <Badge variant="warning">Per-college</Badge>
        )}
        {!template.is_active && <Badge variant="default">Archived</Badge>}
        {template.is_system_template && <Badge variant="primary">System</Badge>}
        {template.active_workflow_count > 0 && (
          <span className="text-gray-500">
            {template.active_workflow_count} active workflow
            {template.active_workflow_count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {template.instantiation_scope === "student_college" && (
        <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          This is a per-college template. Apply it to a specific school from
          the student's college list. The workflow will be named for that
          school and timed to its application deadline.
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Steps</h2>
          {template.is_editable && (
            <Button size="sm" onClick={() => setShowAddStep(true)}>
              Add step
            </Button>
          )}
        </div>

        {steps.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No steps yet.
            {template.is_editable && (
              <>
                {" "}
                <button
                  type="button"
                  className="text-primary-600 hover:underline"
                  onClick={() => setShowAddStep(true)}
                >
                  Add the first step
                </button>
                .
              </>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-gray-100">
                {steps.map((step, idx) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={idx}
                    editable={template.is_editable}
                    prereqName={
                      step.depends_on_step_id
                        ? stepNamesById[step.depends_on_step_id]
                        : undefined
                    }
                    onEdit={() => setEditingStep(step)}
                    onDelete={() => handleDeleteStep(step.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <Card className="mt-6 px-6 py-5">
        <h2 className="font-semibold text-gray-900">Active workflows</h2>
        <p className="mt-1 text-sm text-gray-500">
          {template.active_workflow_count === 0
            ? "No students are currently running this workflow."
            : `${template.active_workflow_count} student${
                template.active_workflow_count === 1 ? " is" : "s are"
              } running this workflow.`}
        </p>
      </Card>

      <Link
        href="/workflows"
        className="mt-6 inline-block text-sm text-gray-500 hover:text-gray-900"
      >
        ← Back to workflows
      </Link>

      <EditTemplateModal
        open={showEditTemplate}
        onClose={() => setShowEditTemplate(false)}
        template={template}
      />
      <StepFormModal
        open={showAddStep}
        onClose={() => setShowAddStep(false)}
        templateId={template.id}
        nextOrder={steps.length}
        otherSteps={steps}
      />
      <StepFormModal
        open={editingStep !== null}
        onClose={() => setEditingStep(null)}
        templateId={template.id}
        nextOrder={editingStep?.step_order ?? 0}
        otherSteps={steps.filter((s) => s.id !== editingStep?.id)}
        editing={editingStep ?? undefined}
      />
      <ApplyToStudentModal
        open={showApply}
        onClose={() => setShowApply(false)}
        templateId={template.id}
        templateName={template.name}
        students={students}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Step row (sortable)
// ---------------------------------------------------------------------------

function StepRow({
  step,
  index,
  editable,
  prereqName,
  onEdit,
  onDelete,
}: {
  step: WorkflowTemplateStepRow;
  index: number;
  editable: boolean;
  prereqName?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id, disabled: !editable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 px-6 py-4"
    >
      {editable && (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="mt-1 cursor-grab touch-none text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      )}
      <div className="flex-shrink-0 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-gray-900">{step.name}</span>
          {!step.is_required && <Badge variant="default">Optional</Badge>}
          <Badge variant="default">{step.step_type}</Badge>
          {step.visibility_scope !== "staff" && (
            <Badge variant="primary">Visible: {step.visibility_scope}</Badge>
          )}
        </div>
        {step.description && (
          <p className="mt-1 text-sm text-gray-600">{step.description}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
          {step.default_assignee_role && (
            <span>Assigned to: {formatRole(step.default_assignee_role)}</span>
          )}
          {step.default_due_offset_days !== null && (
            <span>
              Due:{" "}
              {step.default_due_offset_days === 0
                ? "on start"
                : `${step.default_due_offset_days > 0 ? "+" : ""}${step.default_due_offset_days} day${
                    Math.abs(step.default_due_offset_days) === 1 ? "" : "s"
                  }`}
            </span>
          )}
          {prereqName && <span>After: {prereqName}</span>}
        </div>
      </div>
      {editable && (
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Edit template modal
// ---------------------------------------------------------------------------

function EditTemplateModal({
  open,
  onClose,
  template,
}: {
  open: boolean;
  onClose: () => void;
  template: WorkflowTemplateDetail;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateWorkflowTemplate(template.id, formData);
      if (result.error) setError(result.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit template">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <Input
          name="name"
          label="Name *"
          required
          defaultValue={template.name}
        />
        <Textarea
          name="description"
          label="Description"
          rows={3}
          defaultValue={template.description ?? ""}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            name="workflow_type"
            label="Type"
            defaultValue={template.workflow_type}
          />
          <Input
            name="category"
            label="Category"
            defaultValue={template.category ?? ""}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add / edit step modal
// ---------------------------------------------------------------------------

function StepFormModal({
  open,
  onClose,
  templateId,
  nextOrder,
  otherSteps,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  nextOrder: number;
  otherSteps: WorkflowTemplateStepRow[];
  editing?: WorkflowTemplateStepRow;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    if (!editing) {
      formData.set("workflow_template_id", templateId);
      formData.set("step_order", String(nextOrder));
    }
    startTransition(async () => {
      const result = editing
        ? await updateTemplateStep(editing.id, formData)
        : await addTemplateStep(formData);
      if (result.error) setError(result.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit step" : "Add step"}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <Input
          name="name"
          label="Step name *"
          required
          defaultValue={editing?.name}
          placeholder='e.g. "Draft Common App essay"'
        />
        <Textarea
          name="description"
          label="Description"
          rows={2}
          defaultValue={editing?.description ?? ""}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            name="step_type"
            label="Step type"
            defaultValue={editing?.step_type ?? "task"}
            options={STEP_TYPE_OPTIONS}
          />
          <Input
            name="task_type"
            label="Task type"
            placeholder="e.g. essay_review"
            defaultValue={editing?.task_type ?? ""}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            name="default_assignee_role"
            label="Default assignee"
            placeholder="Unassigned"
            defaultValue={editing?.default_assignee_role ?? ""}
            options={ROLE_OPTIONS}
          />
          <Input
            name="default_due_offset_days"
            label="Days from start"
            type="number"
            placeholder="e.g. 14"
            defaultValue={
              editing?.default_due_offset_days === null ||
              editing?.default_due_offset_days === undefined
                ? ""
                : String(editing.default_due_offset_days)
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            name="depends_on_step_id"
            label="Depends on"
            placeholder="No prerequisite"
            defaultValue={editing?.depends_on_step_id ?? ""}
            options={otherSteps.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            name="visibility_scope"
            label="Visibility"
            defaultValue={editing?.visibility_scope ?? "staff"}
            options={VISIBILITY_OPTIONS}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="is_required"
            value="true"
            defaultChecked={editing?.is_required ?? true}
            className="h-4 w-4 rounded border-gray-300"
          />
          Required step
        </label>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : editing ? "Save" : "Add step"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Apply to student modal
// ---------------------------------------------------------------------------

function ApplyToStudentModal({
  open,
  onClose,
  templateId,
  templateName,
  students,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("template_id", templateId);
    startTransition(async () => {
      const result = await applyWorkflowToStudent(formData);
      if (result.error) setError(result.error);
      else if ("id" in result) {
        onClose();
        const studentId = formData.get("student_id") as string;
        router.push(`/students/${studentId}`);
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply to student"
      description={`Start a copy of "${templateName}" for a student`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <Select
          name="student_id"
          label="Student *"
          required
          placeholder="Select a student"
          options={students.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Input
          name="start_date"
          label="Start date *"
          type="date"
          required
          defaultValue={today}
        />
        <Input
          name="name"
          label="Workflow name (optional)"
          placeholder={templateName}
        />
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending || students.length === 0}>
            {isPending ? "Applying..." : "Apply workflow"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
        {students.length === 0 && (
          <p className="text-xs text-gray-500">
            No students available — add one first under Students.
          </p>
        )}
      </form>
    </Modal>
  );
}

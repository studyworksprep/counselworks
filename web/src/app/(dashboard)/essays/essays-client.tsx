"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/modals/modal";
import { createEssayDraft } from "@/lib/actions/essays";
import { listStudentCollegesForSelect } from "@/lib/actions/colleges";
import {
  ESSAY_STATUSES,
  ESSAY_STATUS_LABELS,
  ESSAY_STATUS_BADGES,
  ESSAY_TYPE_LABELS,
} from "@/lib/constants/essays";

interface EssayRow {
  id: string;
  title: string;
  essay_type: string;
  status: string;
  prompt_text: string | null;
  word_count: number;
  word_count_target: number | null;
  current_version_number: number;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  student_id: string;
  student_name: string;
  created_by: string;
}

// ---------------------------------------------------------------------------
// Create Essay Modal
// ---------------------------------------------------------------------------
function CreateEssayModal({
  open,
  onClose,
  students,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createEssayDraft(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.id) {
        onClose();
        router.push(`/essays/${result.id}`);
      }
    });
  }

  const [collegeOptions, setCollegeOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [, startLoadingColleges] = useTransition();

  function handleStudentChange(studentId: string) {
    setCollegeOptions([]);
    if (!studentId) return;
    startLoadingColleges(async () => {
      const result = await listStudentCollegesForSelect(studentId);
      if (!("error" in result)) setCollegeOptions(result.colleges);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Essay Draft"
      description="Create a new essay for a student"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Select
          name="student_id"
          label="Student *"
          required
          placeholder="Select a student"
          options={students.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(e) => handleStudentChange(e.target.value)}
        />

        <Select
          name="visibility_scope"
          label="Visible to"
          options={[
            { value: "student", label: "Student (they can write & edit)" },
            { value: "family", label: "Student + family" },
            { value: "staff", label: "Staff only (internal draft)" },
          ]}
        />

        <Select
          name="student_college_id"
          label="For college (optional)"
          placeholder={
            collegeOptions.length > 0
              ? "Select a college"
              : "Select a student first"
          }
          options={collegeOptions.map((c) => ({ value: c.id, label: c.name }))}
        />

        <Input
          name="title"
          label="Title"
          placeholder="e.g. Common App Personal Statement"
        />

        <Select
          name="essay_type"
          label="Essay Type *"
          required
          options={Object.entries(ESSAY_TYPE_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Prompt
          </label>
          <textarea
            name="prompt_text"
            rows={2}
            placeholder="Paste the essay prompt here..."
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <Input
          name="word_count_target"
          label="Word Limit"
          type="number"
          placeholder="e.g. 650"
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create Draft"}
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
// Main
// ---------------------------------------------------------------------------
export function EssaysClient({
  essays,
  students,
}: {
  essays: EssayRow[];
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { searchParams, setParam, setSearchParamDebounced } =
    useDebouncedFilter("/essays");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const columns: Column<EssayRow>[] = [
    {
      key: "title",
      header: "Essay",
      sortValue: (row) => row.title,
      render: (row) => (
        <button
          onClick={() => router.push(`/essays/${row.id}`)}
          className="text-left hover:text-primary-600"
        >
          <span className="font-medium text-gray-900">{row.title}</span>
          <p className="text-xs text-gray-400 mt-0.5">
            {ESSAY_TYPE_LABELS[row.essay_type] ?? row.essay_type}
          </p>
        </button>
      ),
    },
    {
      key: "student_name",
      header: "Student",
      sortValue: (row) => row.student_name,
      render: (row) => (
        <span className="text-gray-600">{row.student_name}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge variant={ESSAY_STATUS_BADGES[row.status] ?? "default"}>
          {ESSAY_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: "word_count",
      header: "Words",
      align: "right",
      sortValue: (row) => row.word_count,
      render: (row) => (
        <span className="text-gray-600 text-sm">
          {row.word_count}
          {row.word_count_target && (
            <span className="text-gray-400"> / {row.word_count_target}</span>
          )}
        </span>
      ),
    },
    {
      key: "current_version_number",
      header: "Version",
      render: (row) => (
        <span className="text-gray-500 text-sm">v{row.current_version_number}</span>
      ),
    },
    {
      key: "updated_at",
      header: "Last Updated",
      sortValue: (row) => row.updated_at,
      render: (row) => (
        <span className="text-gray-500 text-sm">
          {format(parseISO(row.updated_at), "MMM d, yyyy")}
        </span>
      ),
    },
  ];

  return (
    <PageShell
      title="Essays"
      description="Manage student essay drafts and revisions"
      actions={
        <Button onClick={() => setShowCreateModal(true)}>New Essay</Button>
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search essays..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => setSearchParamDebounced("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All statuses"
              value={searchParams.get("status") ?? ""}
              onChange={(e) => setParam("status", e.target.value)}
              options={ESSAY_STATUSES.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
              className="w-44"
            />
            <Select
              placeholder="All types"
              value={searchParams.get("essay_type") ?? ""}
              onChange={(e) => setParam("essay_type", e.target.value)}
              options={Object.entries(ESSAY_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              className="w-44"
            />
            <Select
              placeholder="All students"
              value={searchParams.get("student_id") ?? ""}
              onChange={(e) => setParam("student_id", e.target.value)}
              options={students.map((s) => ({ value: s.id, label: s.name }))}
              className="w-44"
            />
            <span className="text-sm text-gray-500">
              {essays.length} essay{essays.length !== 1 && "s"}
            </span>
          </div>
        </div>

        {essays.length === 0 ? (
          <EmptyState
            title="No essays yet"
            description="Create an essay draft to help students craft their college application essays."
            actionLabel="New Essay"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <DataTable
            columns={columns}
            data={essays}
            keyExtractor={(e) => e.id}
            initialSort={{ key: "updated_at", dir: "desc" }}
          />
        )}
      </Card>

      <CreateEssayModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        students={students}
      />
    </PageShell>
  );
}

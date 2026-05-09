"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modals/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addStudentCollege,
  updateStudentCollege,
  removeStudentCollege,
} from "@/lib/actions/colleges";
import { applyWorkflowToStudent } from "@/lib/actions/workflows";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface College {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state_region: string | null;
  website_url: string | null;
  acceptance_rate: number | null;
  sat_avg: number | null;
  act_avg: number | null;
  undergraduate_size: number | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  net_price_avg: number | null;
  graduation_rate: number | null;
  retention_rate: number | null;
  earnings_median_10yr: number | null;
  median_debt: number | null;
  federal_loan_rate: number | null;
  institution_type: string | null;
  locale_type: string | null;
  scorecard_synced_at: string | null;
  usnews_national_rank: number | null;
  usnews_liberal_arts_rank: number | null;
  usnews_business_rank: number | null;
}

interface StudentCollegeRow {
  id: string;
  category: string;
  round_type: string | null;
  intended_major: string | null;
  status: string;
  interest_level: number | null;
  counselor_fit_rating: number | null;
  notes: string | null;
  sort_order: number;
  colleges: College | null;
}

interface PerCollegeTemplate {
  id: string;
  name: string;
  description: string | null;
  step_count: number;
}

interface Props {
  studentId: string;
  studentName: string;
  graduationYear: number;
  collegeList: StudentCollegeRow[];
  allColleges: { id: string; name: string }[];
  perCollegeTemplates: PerCollegeTemplate[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { key: "safety", label: "Safety", variant: "success" as const },
  { key: "likely", label: "Likely", variant: "success" as const },
  { key: "target", label: "Target", variant: "primary" as const },
  { key: "reach", label: "Reach", variant: "warning" as const },
  { key: "far_reach", label: "Far Reach", variant: "danger" as const },
];

const categoryVariant: Record<string, "success" | "warning" | "danger" | "primary" | "default"> = {
  safety: "success",
  likely: "success",
  target: "primary",
  reach: "warning",
  far_reach: "danger",
};

const ROUND_OPTIONS = [
  { value: "ea", label: "Early Action" },
  { value: "ed", label: "Early Decision" },
  { value: "ed2", label: "ED II" },
  { value: "rea", label: "REA" },
  { value: "rd", label: "Regular Decision" },
  { value: "rolling", label: "Rolling" },
];

const STATUS_OPTIONS = [
  { value: "researching", label: "Researching" },
  { value: "considering", label: "Considering" },
  { value: "applying", label: "Applying" },
  { value: "applied", label: "Applied" },
  { value: "removed", label: "Removed" },
];

function pct(v: number | null) {
  return v == null ? "--" : `${(v * 100).toFixed(0)}%`;
}

function usd(v: number | null) {
  return v == null ? "--" : `$${v.toLocaleString()}`;
}

function rankLabel(row: College) {
  if (row.usnews_national_rank) return `#${row.usnews_national_rank} National`;
  if (row.usnews_liberal_arts_rank) return `#${row.usnews_liberal_arts_rank} LAC`;
  return null;
}

// ---------------------------------------------------------------------------
// College card
// ---------------------------------------------------------------------------
function CollegeCard({
  entry,
  onEdit,
  onRemove,
  onAddWorkflow,
  hasPerCollegeTemplates,
}: {
  entry: StudentCollegeRow;
  onEdit: (entry: StudentCollegeRow) => void;
  onRemove: (entry: StudentCollegeRow) => void;
  onAddWorkflow: (entry: StudentCollegeRow) => void;
  hasPerCollegeTemplates: boolean;
}) {
  const c = entry.colleges;
  if (!c) return null;

  const rank = rankLabel(c);
  const location = [c.city, c.state_region].filter(Boolean).join(", ");

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/college-planning/${c.id}`}
              className="text-sm font-semibold text-gray-900 hover:text-primary-600 truncate"
            >
              {c.name}
            </Link>
            {rank && (
              <span className="text-xs text-gray-500 font-medium">{rank}</span>
            )}
          </div>
          {location && (
            <p className="text-xs text-gray-500 mt-0.5">{location}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasPerCollegeTemplates && (
            <button
              type="button"
              onClick={() => onAddWorkflow(entry)}
              className="rounded p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50"
              title="Add supplement workflow"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="rounded p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="Edit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onRemove(entry)}
            className="rounded p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50"
            title="Remove"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
        <Stat label="Accept Rate" value={pct(c.acceptance_rate)} />
        <Stat label="SAT Avg" value={c.sat_avg?.toString() ?? "--"} />
        <Stat label="Net Price" value={usd(c.net_price_avg)} />
        <Stat label="Grad Rate" value={pct(c.graduation_rate)} />
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {entry.round_type && (
          <Badge variant="default">
            {ROUND_OPTIONS.find((r) => r.value === entry.round_type)?.label ?? entry.round_type}
          </Badge>
        )}
        {entry.intended_major && (
          <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5">
            {entry.intended_major}
          </span>
        )}
        <Badge variant="default">{entry.status}</Badge>
      </div>

      {entry.notes && (
        <p className="mt-2 text-xs text-gray-500 line-clamp-2">{entry.notes}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400">{label}</span>
      <span className="ml-1 font-medium text-gray-700">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add college modal
// ---------------------------------------------------------------------------
function AddCollegeModal({
  open,
  onClose,
  studentId,
  allColleges,
  existingCollegeIds,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  allColleges: { id: string; name: string }[];
  existingCollegeIds: Set<string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const available = allColleges.filter((c) => !existingCollegeIds.has(c.id));
    if (!search) return available;
    const term = search.toLowerCase();
    return available.filter((c) => c.name.toLowerCase().includes(term));
  }, [allColleges, existingCollegeIds, search]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_id", studentId);
    startTransition(async () => {
      const result = await addStudentCollege(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSearch("");
        onClose();
      }
    });
  }

  function handleClose() {
    setError(null);
    setSearch("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add College" description="Add a college to this student's list">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">College *</label>
          <Input
            placeholder="Search colleges..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-1"
          />
          <select
            name="college_id"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            size={6}
          >
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {filtered.length} college{filtered.length !== 1 && "s"} available
          </p>
        </div>

        <Select
          name="category"
          label="Category *"
          required
          placeholder="Select category"
          options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
        />

        <Select
          name="round_type"
          label="Application Round"
          placeholder="Select round (optional)"
          options={ROUND_OPTIONS}
        />

        <Input name="intended_major" label="Intended Major" placeholder="e.g. Computer Science" />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding..." : "Add College"}
          </Button>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit college modal
// ---------------------------------------------------------------------------
function EditCollegeModal({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: StudentCollegeRow | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!entry) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateStudentCollege(entry!.id, formData);
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
      title={`Edit — ${entry.colleges?.name ?? "College"}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            name="category"
            label="Category"
            defaultValue={entry.category}
            options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          />

          <Select
            name="status"
            label="Status"
            defaultValue={entry.status}
            options={STATUS_OPTIONS}
          />

          <Select
            name="round_type"
            label="Application Round"
            defaultValue={entry.round_type ?? ""}
            placeholder="None"
            options={ROUND_OPTIONS}
          />

          <Input
            name="intended_major"
            label="Intended Major"
            defaultValue={entry.intended_major ?? ""}
            placeholder="e.g. Computer Science"
          />

          <Select
            name="interest_level"
            label="Interest Level"
            defaultValue={entry.interest_level?.toString() ?? ""}
            placeholder="Not rated"
            options={[
              { value: "1", label: "1 — Low" },
              { value: "2", label: "2" },
              { value: "3", label: "3 — Medium" },
              { value: "4", label: "4" },
              { value: "5", label: "5 — High" },
            ]}
          />

          <Select
            name="counselor_fit_rating"
            label="Counselor Fit Rating"
            defaultValue={entry.counselor_fit_rating?.toString() ?? ""}
            placeholder="Not rated"
            options={[
              { value: "1", label: "1 — Poor Fit" },
              { value: "2", label: "2" },
              { value: "3", label: "3 — Moderate" },
              { value: "4", label: "4" },
              { value: "5", label: "5 — Great Fit" },
            ]}
          />
        </div>

        <Textarea
          name="notes"
          label="Notes"
          defaultValue={entry.notes ?? ""}
          placeholder="Internal counselor notes about this college for this student..."
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
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
// Remove confirmation modal
// ---------------------------------------------------------------------------
function RemoveConfirmModal({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: StudentCollegeRow | null;
}) {
  const [isPending, startTransition] = useTransition();

  if (!entry) return null;

  function handleRemove() {
    startTransition(async () => {
      await removeStudentCollege(entry!.id);
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remove College"
      description={`Are you sure you want to remove ${entry.colleges?.name ?? "this college"} from the list?`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleRemove} disabled={isPending}>
            {isPending ? "Removing..." : "Remove"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-500">
        This will remove the college from the student&apos;s list. Any associated
        application data will remain but will no longer be linked to this list entry.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function StudentCollegeListClient({
  studentId,
  studentName,
  graduationYear,
  collegeList,
  allColleges,
  perCollegeTemplates,
}: Props) {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEntry, setEditEntry] = useState<StudentCollegeRow | null>(null);
  const [removeEntry, setRemoveEntry] = useState<StudentCollegeRow | null>(null);
  const [workflowEntry, setWorkflowEntry] = useState<StudentCollegeRow | null>(null);

  const existingCollegeIds = useMemo(
    () => new Set(collegeList.map((e) => e.colleges?.id).filter(Boolean) as string[]),
    [collegeList]
  );

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, StudentCollegeRow[]>();
    for (const cat of CATEGORIES) {
      map.set(cat.key, []);
    }
    for (const entry of collegeList) {
      const list = map.get(entry.category);
      if (list) {
        list.push(entry);
      } else {
        // Unknown category — put in target
        const target = map.get("target")!;
        target.push(entry);
      }
    }
    return map;
  }, [collegeList]);

  const handleEdit = useCallback((entry: StudentCollegeRow) => setEditEntry(entry), []);
  const handleRemove = useCallback((entry: StudentCollegeRow) => setRemoveEntry(entry), []);
  const handleAddWorkflow = useCallback(
    (entry: StudentCollegeRow) => setWorkflowEntry(entry),
    [],
  );
  const hasPerCollegeTemplates = perCollegeTemplates.length > 0;

  // Summary stats
  const totalCount = collegeList.length;
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      counts[cat.key] = grouped.get(cat.key)?.length ?? 0;
    }
    return counts;
  }, [grouped]);

  return (
    <PageShell
      title={`${studentName}'s College List`}
      description={`Class of ${graduationYear} · ${totalCount} college${totalCount !== 1 ? "s" : ""}`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/students/${studentId}`)}>
            Back to Profile
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            Add College
          </Button>
        </div>
      }
    >
      {/* Category summary */}
      <div className="flex flex-wrap gap-3 mb-6">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm"
          >
            <Badge variant={cat.variant}>{cat.label}</Badge>
            <span className="font-medium text-gray-700">{categoryCounts[cat.key]}</span>
          </div>
        ))}
      </div>

      {totalCount === 0 ? (
        <Card>
          <EmptyState
            title="No colleges yet"
            description="Start building this student's college list by adding schools to research and track."
            actionLabel="Add College"
            onAction={() => setShowAddModal(true)}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const entries = grouped.get(cat.key)!;
            if (entries.length === 0) return null;
            return (
              <Card key={cat.key}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant={cat.variant}>{cat.label}</Badge>
                    <span className="text-sm text-gray-500">
                      {entries.length} school{entries.length !== 1 && "s"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {entries.map((entry) => (
                      <CollegeCard
                        key={entry.id}
                        entry={entry}
                        onEdit={handleEdit}
                        onRemove={handleRemove}
                        onAddWorkflow={handleAddWorkflow}
                        hasPerCollegeTemplates={hasPerCollegeTemplates}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddCollegeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        studentId={studentId}
        allColleges={allColleges}
        existingCollegeIds={existingCollegeIds}
      />

      <EditCollegeModal
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        entry={editEntry}
      />

      <RemoveConfirmModal
        open={!!removeEntry}
        onClose={() => setRemoveEntry(null)}
        entry={removeEntry}
      />

      <SupplementWorkflowModal
        open={!!workflowEntry}
        onClose={() => setWorkflowEntry(null)}
        studentId={studentId}
        entry={workflowEntry}
        templates={perCollegeTemplates}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Apply per-college supplement workflow modal
// ---------------------------------------------------------------------------
function SupplementWorkflowModal({
  open,
  onClose,
  studentId,
  entry,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  entry: StudentCollegeRow | null;
  templates: PerCollegeTemplate[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!entry) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_id", studentId);
    formData.set("student_college_id", entry.id);
    startTransition(async () => {
      const result = await applyWorkflowToStudent(formData);
      if (result.error) setError(result.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  if (!entry) return null;
  const collegeName = entry.colleges?.name ?? "this college";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add supplement workflow"
      description={`Apply a per-college template to ${collegeName}. The workflow will be named for this school and timed to its application deadline.`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <Select
          name="template_id"
          label="Template *"
          required
          placeholder="Select a template"
          options={templates.map((t) => ({
            value: t.id,
            label: `${t.name} (${t.step_count} steps)`,
          }))}
        />
        <Input
          name="start_date"
          label="Start date (optional)"
          type="date"
          placeholder="Defaults to deadline minus 45 days"
        />
        <p className="text-xs text-gray-500">
          Leave the start date blank to auto-compute it from the application's
          deadline (45 days before).
        </p>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Applying..." : "Apply workflow"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

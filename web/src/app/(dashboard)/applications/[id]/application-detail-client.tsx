"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { formatDate, isOverdue } from "@/lib/utils";
import {
  updateApplicationDetails,
  updateApplicationDecision,
  updateApplicationChecklist,
} from "@/lib/actions/applications";
import { updateEssayLink } from "@/lib/actions/essays";
import {
  APPLICATION_ROUNDS,
  ROUND_FULL_LABELS,
  DECISION_RESULTS,
  DEPOSIT_STATUS_OPTIONS,
  STAGE_LABELS,
  buildDefaultChecklist,
  parseChecklist,
  type ChecklistItem,
} from "@/lib/constants/applications";

const DECISION_VARIANT: Record<
  string,
  "success" | "danger" | "warning" | "default"
> = {
  accepted: "success",
  rejected: "danger",
  waitlisted: "warning",
  deferred: "warning",
};

interface EssayRow {
  id: string;
  title: string;
  essay_type: string;
  status: string;
  visibility_scope: string;
  current_version_number: number;
  updated_at: string;
}

interface ApplicationDetail {
  id: string;
  application_type: string;
  stage: string;
  deadline_at: string | null;
  submitted_at: string | null;
  decision_at: string | null;
  decision_result: string | null;
  financial_aid_required: boolean;
  checklist_json: unknown;
  student_college_id: string;
  student_id: string;
  college_id: string;
  students: unknown;
  colleges: unknown;
  student_colleges: unknown;
  essays: EssayRow[];
  supplementWorkflows: { id: string; name: string; status: string }[];
  unlinkedEssays: { id: string; title: string; essay_type: string }[];
}

function one<T>(value: unknown): T | null {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) as T;
}

export function ApplicationDetailClient({
  application,
}: {
  application: ApplicationDetail;
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showDecision, setShowDecision] = useState(false);
  const [decisionResult, setDecisionResult] = useState("accepted");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const student = one<{
    id: string;
    first_name: string;
    last_name: string;
    graduation_year: number;
  }>(application.students);
  const college = one<{
    id: string;
    name: string;
    city: string | null;
    state_region: string | null;
    application_platform: string | null;
  }>(application.colleges);
  const listRow = one<{
    id: string;
    category: string;
    deposit_status: string | null;
  }>(application.student_colleges);

  // Optimistic checklist (fix plan 8.10): toggles apply instantly to local
  // state; a short debounce batches the write into one round-trip.
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    () =>
      parseChecklist(application.checklist_json) ??
      buildDefaultChecklist({
        round: application.application_type,
        financialAidRequired: application.financial_aid_required,
      })
  );
  const checklistFlush = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneCount = checklist.filter((c) => c.done).length;

  function handleToggle(key: string, done: boolean) {
    setChecklist((prev) => {
      const next = prev.map((item) =>
        item.key === key ? { ...item, done } : item
      );
      if (checklistFlush.current) clearTimeout(checklistFlush.current);
      checklistFlush.current = setTimeout(async () => {
        const result = await updateApplicationChecklist(application.id, next);
        if ("error" in result && result.error) {
          setError(result.error);
          router.refresh();
        }
      }, 600);
      return next;
    });
  }

  function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateApplicationDetails(application.id, formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setShowEdit(false);
      router.refresh();
    });
  }

  function handleDecisionSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateApplicationDecision(
        application.id,
        (formData.get("decision_result") as string) || "",
        {
          decisionDate: (formData.get("decision_at") as string) || undefined,
          depositStatus:
            (formData.get("deposit_status") as string) || undefined,
          createFollowUpTask: formData.get("create_follow_up") === "on",
        }
      );
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setShowDecision(false);
      router.refresh();
    });
  }

  function handleLinkEssay(essayId: string) {
    if (!essayId) return;
    startTransition(async () => {
      await updateEssayLink(essayId, application.student_college_id);
      router.refresh();
    });
  }

  const overdue =
    application.deadline_at &&
    !application.submitted_at &&
    isOverdue(application.deadline_at);

  return (
    <PageShell
      title={`${college?.name ?? "Application"} — ${
        ROUND_FULL_LABELS[application.application_type] ??
        application.application_type
      }`}
      description={
        student
          ? `${student.first_name} ${student.last_name} · Class of ${student.graduation_year}`
          : ""
      }
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/applications")}>
            All Applications
          </Button>
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            Edit Details
          </Button>
          {!application.decision_result && (
            <Button onClick={() => setShowDecision(true)}>
              Record Decision
            </Button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Requirements checklist */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Requirements Checklist
                </h3>
                <span className="text-sm text-gray-500">
                  {doneCount}/{checklist.length} complete
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all"
                  style={{
                    width: `${(doneCount / Math.max(checklist.length, 1)) * 100}%`,
                  }}
                />
              </div>
              <ul className="divide-y divide-gray-50">
                {checklist.map((item) => (
                  <li key={item.key} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={isPending}
                      onChange={(e) => handleToggle(item.key, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span
                      className={`text-sm ${
                        item.done
                          ? "text-gray-400 line-through"
                          : "text-gray-800"
                      }`}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Linked essays */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Essays</h3>
            </CardHeader>
            <CardContent>
              {application.essays.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No essays linked to this application yet.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {application.essays.map((essay) => (
                    <li
                      key={essay.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <Link
                          href={`/essays/${essay.id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700"
                        >
                          {essay.title}
                        </Link>
                        <p className="text-xs text-gray-400">
                          v{essay.current_version_number} ·{" "}
                          {formatDate(essay.updated_at)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          essay.status === "final" || essay.status === "approved"
                            ? "success"
                            : "default"
                        }
                      >
                        {essay.status.replace(/_/g, " ")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {application.unlinkedEssays.length > 0 && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Link an existing essay
                  </label>
                  <select
                    onChange={(e) => handleLinkEssay(e.target.value)}
                    disabled={isPending}
                    defaultValue=""
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Select an essay…</option>
                    {application.unlinkedEssays.map((essay) => (
                      <option key={essay.id} value={essay.id}>
                        {essay.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Status */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Status</h3>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Stage</dt>
                  <dd>
                    <Badge variant="primary">
                      {STAGE_LABELS[application.stage] ?? application.stage}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Deadline</dt>
                  <dd
                    className={`font-medium ${
                      overdue ? "text-danger-600" : "text-gray-900"
                    }`}
                  >
                    {application.deadline_at
                      ? formatDate(application.deadline_at)
                      : "—"}
                  </dd>
                </div>
                {application.submitted_at && (
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">Submitted</dt>
                    <dd className="font-medium text-gray-900">
                      {formatDate(application.submitted_at)}
                    </dd>
                  </div>
                )}
                {application.decision_result && (
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">Decision</dt>
                    <dd className="flex items-center gap-2">
                      <Badge
                        variant={
                          DECISION_VARIANT[application.decision_result] ??
                          "default"
                        }
                      >
                        {application.decision_result}
                      </Badge>
                      {application.decision_at && (
                        <span className="text-xs text-gray-400">
                          {formatDate(application.decision_at)}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                {listRow?.deposit_status && (
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">Deposit</dt>
                    <dd className="font-medium capitalize text-gray-900">
                      {listRow.deposit_status}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Financial aid</dt>
                  <dd className="font-medium text-gray-900">
                    {application.financial_aid_required ? "Required" : "—"}
                  </dd>
                </div>
              </dl>
              {application.decision_result && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDecision(true)}
                  >
                    Update decision
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* College */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">College</h3>
            </CardHeader>
            <CardContent>
              <Link
                href={`/college-planning/${college?.id ?? ""}`}
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {college?.name}
              </Link>
              <p className="text-xs text-gray-500">
                {[college?.city, college?.state_region]
                  .filter(Boolean)
                  .join(", ")}
                {college?.application_platform &&
                  ` · via ${college.application_platform}`}
              </p>
              {listRow && (
                <p className="mt-2 text-xs text-gray-500">
                  List category:{" "}
                  <span className="font-medium capitalize">
                    {listRow.category.replace(/_/g, " ")}
                  </span>
                </p>
              )}
              {student && (
                <Link
                  href={`/students/${student.id}/colleges`}
                  className="mt-2 inline-block text-xs text-primary-600 hover:text-primary-700"
                >
                  View full college list →
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Supplement workflows */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">
                Supplement Workflow
              </h3>
            </CardHeader>
            <CardContent>
              {application.supplementWorkflows.length === 0 ? (
                <p className="text-sm text-gray-500">
                  None yet — add one from the student&apos;s college list to
                  scaffold supplement drafting against this deadline.
                </p>
              ) : (
                <ul className="space-y-2">
                  {application.supplementWorkflows.map((wf) => (
                    <li key={wf.id} className="text-sm text-gray-800">
                      {wf.name}
                      <Badge variant="default" className="ml-2">
                        {wf.status.replace(/_/g, " ")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit details modal */}
      <Modal
        open={showEdit}
        onClose={() => !isPending && setShowEdit(false)}
        title="Edit application details"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
          )}
          <Select
            name="application_type"
            label="Application round"
            defaultValue={application.application_type}
            options={APPLICATION_ROUNDS.map((r) => ({
              value: r.value,
              label: r.label,
            }))}
          />
          <Input
            name="deadline_at"
            label="Deadline"
            type="date"
            defaultValue={
              application.deadline_at
                ? application.deadline_at.slice(0, 10)
                : ""
            }
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="financial_aid_required"
              defaultChecked={application.financial_aid_required}
              className="h-4 w-4 rounded border-gray-300"
            />
            Financial aid application required (adds FAFSA/CSS to new
            checklists)
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEdit(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Decision modal */}
      <Modal
        open={showDecision}
        onClose={() => !isPending && setShowDecision(false)}
        title="Record decision"
        description="Updates the application, the college list, and the decision reports."
      >
        <form onSubmit={handleDecisionSubmit} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
          )}
          <Select
            name="decision_result"
            label="Decision"
            defaultValue={application.decision_result ?? "accepted"}
            onChange={(e) => setDecisionResult(e.target.value)}
            options={DECISION_RESULTS.map((d) => ({
              value: d.value,
              label: d.label,
            }))}
          />
          <Input
            name="decision_at"
            label="Decision date"
            type="date"
            defaultValue={
              application.decision_at
                ? application.decision_at.slice(0, 10)
                : new Date().toISOString().slice(0, 10)
            }
          />
          {decisionResult === "accepted" && (
            <Select
              name="deposit_status"
              label="Deposit / enrollment"
              options={[...DEPOSIT_STATUS_OPTIONS]}
            />
          )}
          {(decisionResult === "waitlisted" ||
            decisionResult === "deferred") && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="create_follow_up"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              Create a follow-up task (letter of continued interest)
            </label>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Record decision
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDecision(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}

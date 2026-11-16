"use client";
import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import {
  recordApplicationDecision,
  saveApplicationNextStep,
  shareApplicationNextStep,
  scheduleApplicationNextStep,
  createDecisionLetter,
  addDecisionChecklist,
} from "@/lib/actions/application-decisions";
import {
  NEXT_STEP_LABELS,
  NEXT_STEP_STATUSES,
} from "@/lib/applications/decisions";
import {
  DECISION_RESULTS,
  DEPOSIT_STATUS_OPTIONS,
  STAGE_LABELS,
} from "@/lib/constants/applications";
import { TASK_STATUS_LABELS } from "@/lib/constants/tasks";
import { formatCalendarDate, formatDate } from "@/lib/utils";
import type { getApplicationDecisions } from "@/lib/db/queries";

type Data = NonNullable<Awaited<ReturnType<typeof getApplicationDecisions>>>;
type Item = Data["items"][number];
type Result = { error?: string; data?: Data | null };
const panel = "rounded-xl border border-gray-200 bg-white p-5 space-y-4";
const field =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
const link =
  "text-sm font-medium text-primary-700 underline underline-offset-2";
const decisionLabel = (value: string | null) =>
  DECISION_RESULTS.find((d) => d.value === value)?.label ?? "Not recorded";
const enrollmentLabel = (value: string | null) =>
  value === "committed"
    ? "Committed (deposit paid)"
    : value === "declined"
      ? "Offer declined"
      : "Not recorded";
function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

function DecisionEditor({
  data,
  onClose,
  onSaved,
}: {
  data: Data;
  onClose: () => void;
  onSaved: (d: Data) => void;
}) {
  const id = useId(),
    [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const [revision] = useState(data.application.revision);
  const [form, setForm] = useState({
    result: data.application.result ?? "accepted",
    decidedOn: data.application.decidedOn ?? data.today,
    depositStatus: data.application.depositStatus,
    prepareFollowUp: false,
  });
  const [original] = useState(JSON.stringify(form)),
    dirty = original !== JSON.stringify(form);
  useUnsaved(dirty);
  const close = () => {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  return (
    <Modal
      open
      trapFocus
      onClose={close}
      title="Record decision and enrollment"
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            try {
              const r = await recordApplicationDecision({
                ...form,
                applicationId: data.application.id,
                revision,
              });
              if (r.error) setError(r.error);
              else if (r.data) {
                onSaved(r.data);
                onClose();
              }
            } catch {
              setError("Unable to save. Your edits are still here.");
            }
          });
        }}
      >
        <p className="text-sm text-gray-600">
          Decision facts and enrollment status are visible to the student and
          linked parents. A new dated entry preserves the previous record.
          Earlier next-step reminders pause for review.
        </p>
        <p className="text-sm">
          Record the college’s actual decision and any externally confirmed
          enrollment. Deposits and college responses happen in the college’s
          portal.
        </p>
        <fieldset disabled={pending} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor={`${id}-result`}>
            Decision
            <select
              id={`${id}-result`}
              aria-label="Decision"
              className={field}
              value={form.result}
              onChange={(e) =>
                setForm({
                  ...form,
                  result: e.target.value,
                  depositStatus:
                    e.target.value === "accepted" ? form.depositStatus : "",
                  prepareFollowUp: false,
                })
              }
            >
              {DECISION_RESULTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium" htmlFor={`${id}-date`}>
            Decision date
            <input
              id={`${id}-date`}
              className={field}
              type="date"
              required
              max={data.today}
              value={form.decidedOn}
              onChange={(e) => setForm({ ...form, decidedOn: e.target.value })}
            />
          </label>
          {form.result === "accepted" && (
            <label
              className="block text-sm font-medium"
              htmlFor={`${id}-deposit`}
            >
              Deposit / enrollment
              <select
                id={`${id}-deposit`}
                aria-label="Deposit / enrollment"
                className={field}
                value={form.depositStatus}
                onChange={(e) =>
                  setForm({ ...form, depositStatus: e.target.value })
                }
              >
                {DEPOSIT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {["waitlisted", "deferred"].includes(form.result) && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.prepareFollowUp}
                onChange={(e) =>
                  setForm({ ...form, prepareFollowUp: e.target.checked })
                }
              />
              Prepare a response-planning next step
            </label>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-danger-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            Save decision
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={pending}
          >
            Cancel
          </Button>
          {discard && (
            <Button type="button" variant="danger" onClick={onClose}>
              Discard decision edits
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function StepEditor({
  data,
  item,
  onClose,
  onSaved,
}: {
  data: Data;
  item?: Item;
  onClose: () => void;
  onSaved: (d: Data) => void;
}) {
  const id = useId(),
    [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const [decisionRevision] = useState(data.application.revision),
    [revision] = useState(item?.revision ?? 0);
  const [form, setForm] = useState({
    title: item?.title ?? "",
    status: item?.current ? item.status : "needed",
    dueOn: item?.due_on ?? "",
    completedOn: item?.current ? (item.completed_on ?? "") : "",
    notes: item?.notes ?? "",
    essayId: item?.essayUnavailable ? "keep" : (item?.essay_id ?? ""),
    documentId: item?.documentUnavailable ? "keep" : (item?.document_id ?? ""),
  });
  const [original] = useState(JSON.stringify(form)),
    dirty = original !== JSON.stringify(form);
  useUnsaved(dirty);
  const change = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDiscard(false);
  };
  const close = () => {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  return (
    <Modal
      open
      trapFocus
      onClose={close}
      title={
        item && !item.current
          ? "Review step for current decision"
          : item
            ? "Edit next step"
            : "Add next step"
      }
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            try {
              const r = await saveApplicationNextStep({
                ...form,
                applicationId: data.application.id,
                id: item?.id,
                revision,
                decisionRevision,
                kind: item?.kind ?? data.kind,
                dueOn: form.dueOn || null,
                completedOn: form.completedOn || null,
                essayId:
                  form.essayId === "keep" ? undefined : form.essayId || null,
                documentId:
                  form.documentId === "keep"
                    ? undefined
                    : form.documentId || null,
              });
              if (r.error) setError(r.error);
              else if (r.data) {
                onSaved(r.data);
                onClose();
              }
            } catch {
              setError("Unable to save. Your edits are still here.");
            }
          });
        }}
      >
        <p className="text-sm text-gray-600">
          Shared with the student and counseling team. Changes pause parent
          access until the student shares this step again. Documents and writing
          keep their own permissions.
        </p>
        {item && !item.current && (
          <p className="text-sm font-medium">
            Check the deadline, instructions and linked work against the new
            decision. Completion starts as Needed; earlier task history is
            preserved.
          </p>
        )}
        <fieldset disabled={pending} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor={`${id}-title`}>
            Step name
            <input
              id={`${id}-title`}
              className={field}
              required
              maxLength={160}
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium" htmlFor={`${id}-status`}>
            Step status
            <select
              id={`${id}-status`}
              aria-label="Step status"
              className={field}
              value={form.status}
              onChange={(e) => {
                change("status", e.target.value);
                if (e.target.value !== "completed") change("completedOn", "");
              }}
            >
              {NEXT_STEP_STATUSES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium" htmlFor={`${id}-due`}>
            College response or requirement deadline
            <input
              id={`${id}-due`}
              className={field}
              type="date"
              value={form.dueOn}
              onChange={(e) => change("dueOn", e.target.value)}
            />
          </label>
          <p className="text-xs text-gray-600">
            Use the deadline verified in the college portal. Schedule a separate
            follow-up below to choose who receives reminders.
          </p>
          {form.status === "completed" && (
            <label
              className="block text-sm font-medium"
              htmlFor={`${id}-completed`}
            >
              Confirmed complete on
              <input
                id={`${id}-completed`}
                className={field}
                type="date"
                required
                max={data.today}
                value={form.completedOn}
                onChange={(e) => change("completedOn", e.target.value)}
              />
            </label>
          )}
          <label className="block text-sm font-medium" htmlFor={`${id}-notes`}>
            Step notes or confirmation reference
            <textarea
              id={`${id}-notes`}
              aria-label="Step notes or confirmation reference"
              className={field}
              rows={3}
              maxLength={4000}
              value={form.notes}
              onChange={(e) => change("notes", e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium" htmlFor={`${id}-essay`}>
            Linked writing
            <select
              id={`${id}-essay`}
              aria-label="Linked writing"
              className={field}
              value={form.essayId}
              onChange={(e) => change("essayId", e.target.value)}
            >
              <option value="">No writing linked</option>
              {item?.essayUnavailable && (
                <option value="keep">
                  Keep existing writing (currently unavailable)
                </option>
              )}
              {data.essays.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <label
            className="block text-sm font-medium"
            htmlFor={`${id}-document`}
          >
            Supporting document
            <select
              id={`${id}-document`}
              aria-label="Supporting document"
              className={field}
              value={form.documentId}
              onChange={(e) => change("documentId", e.target.value)}
            >
              <option value="">No document</option>
              {item?.documentUnavailable && (
                <option value="keep">
                  Keep existing attachment (currently unavailable)
                </option>
              )}
              {data.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-danger-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            Save next step
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
          {discard && (
            <Button type="button" variant="danger" onClick={onClose}>
              Discard next-step edits
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function FollowUpForm({
  data,
  item,
  task,
  onResult,
}: {
  data: Data;
  item: Item;
  task?: Item["tasks"][number];
  onResult: (result: Result) => void;
}) {
  const id = useId(),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const owners = data.owners.filter(
    (o) => o.role !== "parent_guardian" || item.family_shared,
  );
  return (
    <details className="rounded-lg bg-gray-50 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {task ? "Reschedule follow-up" : "Schedule follow-up"}
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError("");
          start(async () => {
            try {
              const r = await scheduleApplicationNextStep({
                applicationId: data.application.id,
                id: item.id,
                revision: item.revision,
                ownerId: f.get("owner"),
                dueOn: f.get("due"),
                taskId: task?.id,
                taskRevision: task?.revision,
              });
              if (r.error) setError(r.error);
              else onResult(r);
            } catch {
              setError("Unable to schedule. Try again.");
            }
          });
        }}
      >
        <label className="block text-sm" htmlFor={`${id}-owner`}>
          Responsible person
          <select
            className={field}
            name="owner"
            id={`${id}-owner`}
            aria-label="Responsible person"
            defaultValue={task?.ownerId}
            required
            disabled={pending}
          >
            {task && !owners.some((o) => o.id === task.ownerId) && (
              <option value={task.ownerId} disabled>
                {task.owner} — choose an eligible owner
              </option>
            )}
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm" htmlFor={`${id}-due`}>
          Follow-up date
          <input
            className={field}
            name="due"
            id={`${id}-due`}
            defaultValue={task?.dueOn ?? ""}
            type="date"
            required
            disabled={pending}
          />
        </label>
        <p className="text-sm text-gray-600">
          Reminders use the responsible person’s notification preferences and
          the firm’s calendar. Parent owners require student-approved sharing.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        )}
        <Button type="submit" loading={pending} disabled={!owners.length}>
          {task ? "Save follow-up date and owner" : "Create follow-up"}
        </Button>
      </form>
    </details>
  );
}

export function ApplicationDecisions({ initialData }: { initialData: Data }) {
  const [data, setData] = useState(initialData),
    [decisionEditor, setDecisionEditor] = useState(false),
    [stepEditor, setStepEditor] = useState<{ item?: Item } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, start] = useTransition();
  const result = (r: Result) => {
    if (r.error) setError(r.error);
    else if (r.data) {
      setData(r.data);
      setNotice("Decision workspace updated.");
    }
  };
  const run = (action: () => Promise<Result>) => {
    setError("");
    start(async () => {
      try {
        result(await action());
      } catch {
        setError("Unable to save. Please try again.");
      }
    });
  };
  return (
    <PageShell
      title="Decision and enrollment"
      description={`${data.application.student} · ${data.application.college}`}
    >
      <div className="mx-auto min-w-0 max-w-5xl space-y-6 break-words [overflow-wrap:anywhere]">
        <nav
          aria-label="Decision and enrollment workspace"
          className="flex flex-wrap gap-4"
        >
          <Link className={link} href={data.applicationHref}>
            Applications
          </Link>
          <Link className={link} href={data.followThroughHref}>
            Application follow-through
          </Link>
          {data.costHref && (
            <Link className={link} href={data.costHref}>
              Compare recorded costs and aid
            </Link>
          )}
        </nav>
        <section className={panel} aria-labelledby="current-outcome">
          <h2 id="current-outcome" className="text-lg font-semibold">
            Current outcome
          </h2>
          <p>
            Application status:{" "}
            {STAGE_LABELS[data.application.stage] ?? data.application.stage}
          </p>
          <p className="font-medium">
            Decision: {decisionLabel(data.application.result)}
            {data.application.decidedOn &&
              ` · ${formatCalendarDate(data.application.decidedOn)}`}
          </p>
          {data.application.result === "accepted" && (
            <p>Enrollment: {enrollmentLabel(data.application.depositStatus)}</p>
          )}
          <p className="text-sm text-gray-600">
            Your counseling team records factual outcomes here. Deposits,
            waitlist responses and enrollment happen in the college’s portal;
            record their confirmation in this workspace.
          </p>
          {data.canRecord && (
            <Button variant="outline" onClick={() => setDecisionEditor(true)}>
              Record decision or enrollment
            </Button>
          )}
        </section>
        <section className={panel} aria-labelledby="decision-history">
          <h2 id="decision-history" className="text-lg font-semibold">
            Decision history
          </h2>
          {data.history.length ? (
            <ol className="space-y-3">
              {data.history.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-gray-200 p-3 text-sm"
                >
                  <p className="font-medium">
                    {decisionLabel(e.result)} ·{" "}
                    {e.decided_on
                      ? formatCalendarDate(e.decided_on)
                      : "Decision date not recorded"}
                  </p>
                  {e.result === "accepted" && (
                    <p>Enrollment: {enrollmentLabel(e.deposit_status)}</p>
                  )}
                  <p className="text-gray-500">
                    {e.origin === "existing_record"
                      ? "Existing record captured when history tracking began; earlier changes are unknown."
                      : `Recorded ${formatDate(e.recorded_at)}${e.recordedBy ? ` by ${e.recordedBy}` : ""} · Entry ${e.revision}`}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-600">
              No decision history yet. Existing current facts remain above; new
              entries will preserve changes.
            </p>
          )}
        </section>
        <section className={panel} aria-labelledby="next-steps">
          <h2 id="next-steps" className="text-lg font-semibold">
            {data.kind ? NEXT_STEP_LABELS[data.kind] : "Decision next steps"}
          </h2>
          <p className="text-sm">
            {data.surface === "family"
              ? "You see steps the student has shared with parents. You can complete follow-up tasks assigned to you; writing and documents keep their own permissions."
              : "Notes and checklist details start with student and counseling-team access. Only the student can share a step with parents; edits require fresh approval."}
          </p>
          {!data.active && (
            <p className="text-sm">
              New steps become available for an active waitlist, deferral or
              acceptance. Previous work remains below.
            </p>
          )}
          {data.active && data.canEdit && (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setStepEditor({})}>
                Add next step
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    addDecisionChecklist({
                      applicationId: data.application.id,
                      revision: data.application.revision,
                    }),
                  )
                }
              >
                Add suggested checklist
              </Button>
            </div>
          )}
          <p className="text-xs text-gray-600">
            Verify each college’s instructions and deadlines. Suggested steps
            are a starting point, not a statement of the college’s requirements.
          </p>
        </section>
        {error && (
          <p role="alert" className="text-danger-700">
            {error}
          </p>
        )}
        <p role="status" className="text-sm text-gray-600">
          {notice}
        </p>
        {!data.items.length && (
          <p className={panel}>
            {data.surface === "family"
              ? "No next steps are currently shared with you."
              : "No next steps yet. Add the college’s requirements or start with a suggested checklist."}
          </p>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {data.items.map((item) => {
            const open = item.tasks.some(
                (t) => !["completed", "cancelled"].includes(t.status),
              ),
              resolved = ["completed", "waived"].includes(item.status);
            const reference = {
              applicationId: data.application.id,
              id: item.id,
              revision: item.revision,
            };
            return (
              <section
                key={item.id}
                id={`next-step-${item.id}`}
                aria-labelledby={`next-step-title-${item.id}`}
                className={panel}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h2
                    id={`next-step-title-${item.id}`}
                    className="text-lg font-semibold"
                  >
                    {item.title}
                  </h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm">
                    {NEXT_STEP_STATUSES.find(([v]) => v === item.status)?.[1] ??
                      item.status}
                  </span>
                </div>
                {!item.current && (
                  <p className="text-sm font-medium text-warning-700">
                    Previous decision plan. Follow-up reminders are paused;
                    review this step for the current decision before reusing it.
                  </p>
                )}
                <p className="text-sm">
                  Deadline:{" "}
                  {item.due_on
                    ? formatCalendarDate(item.due_on)
                    : "Not recorded — verify with the college"}
                </p>
                {item.current &&
                  !resolved &&
                  item.due_on &&
                  item.due_on < data.today && (
                    <p className="text-sm font-medium text-danger-700">
                      Deadline overdue
                    </p>
                  )}
                {item.completed_on && (
                  <p className="text-sm">
                    Confirmed complete: {formatCalendarDate(item.completed_on)}
                  </p>
                )}
                {item.notes && (
                  <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
                )}
                {item.essay && (
                  <p>
                    <Link className={link} href={item.essay.href}>
                      Open writing: {item.essay.title}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">
                      {item.essay.application_phase === "post_decision"
                        ? "Post-decision letter · "
                        : ""}
                      {item.essay.status.replaceAll("_", " ")}
                    </span>
                  </p>
                )}
                {item.document && (
                  <Link className={`${link} block`} href={item.document.href}>
                    Supporting document: {item.document.title}
                  </Link>
                )}
                {(item.essayUnavailable || item.documentUnavailable) && (
                  <p className="text-sm text-gray-500">
                    A linked resource is currently unavailable. Its permissions
                    have not changed.
                  </p>
                )}
                {data.surface !== "family" && (
                  <p className="text-sm text-gray-600">
                    {item.family_shared
                      ? "Shared with parents by the student"
                      : "Student and counseling team only"}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {data.canEdit && data.active && item.kind === data.kind && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStepEditor({ item })}
                    >
                      {item.current
                        ? "Edit next step"
                        : "Review for current decision"}
                    </Button>
                  )}
                  {data.canRecord &&
                    item.current &&
                    item.kind !== "enrollment" &&
                    !item.essay_id &&
                    !item.essayUnavailable && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => createDecisionLetter(reference))
                        }
                      >
                        Create letter draft
                      </Button>
                    )}
                  {data.surface === "student" &&
                    (item.current || item.family_shared) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            shareApplicationNextStep({
                              ...reference,
                              shared: !item.family_shared,
                            }),
                          )
                        }
                      >
                        {item.family_shared
                          ? "Stop sharing with parents"
                          : "Share step with parents"}
                      </Button>
                    )}
                </div>
                {item.tasks.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Follow-ups</h3>
                    {item.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-lg border border-gray-200 p-3 text-sm"
                      >
                        <Link className={link} href={t.href}>
                          Open follow-up
                        </Link>
                        <p>
                          {t.owner} · {TASK_STATUS_LABELS[t.status] ?? t.status}{" "}
                          ·{" "}
                          {t.dueOn
                            ? `Due ${formatCalendarDate(t.dueOn)}`
                            : "No due date"}
                        </p>
                        {item.current &&
                          data.canEdit &&
                          !["completed", "cancelled"].includes(t.status) &&
                          (data.surface === "staff" ||
                            data.owners.some((o) => o.id === t.ownerId)) && (
                            <FollowUpForm
                              key={`${t.id}:${t.revision}:${item.revision}`}
                              data={data}
                              item={item}
                              task={t}
                              onResult={result}
                            />
                          )}
                        {t.parentOwner &&
                          !item.family_shared &&
                          !["completed", "cancelled"].includes(t.status) && (
                            <p>
                              Parent access and reminders are paused until the
                              student shares this step.
                            </p>
                          )}
                      </div>
                    ))}
                  </div>
                )}
                {item.current && data.canEdit && !resolved && !open && (
                  <FollowUpForm data={data} item={item} onResult={result} />
                )}
              </section>
            );
          })}
        </div>
        {decisionEditor && (
          <DecisionEditor
            data={data}
            onClose={() => setDecisionEditor(false)}
            onSaved={(d) => {
              setData(d);
              setNotice(
                "Decision recorded. Earlier next steps need review before reminders resume.",
              );
            }}
          />
        )}
        {stepEditor && (
          <StepEditor
            key={stepEditor.item?.id ?? "new"}
            data={data}
            item={stepEditor.item}
            onClose={() => setStepEditor(null)}
            onSaved={(d) => {
              setData(d);
              setNotice(
                "Next step saved. Parent sharing requires fresh student approval after changes.",
              );
            }}
          />
        )}
      </div>
    </PageShell>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import {
  saveApplicationTracking,
  shareApplicationTracking,
  createApplicationFollowUp,
} from "@/lib/actions/application-follow-through";
import {
  FOLLOW_THROUGH_STATUSES,
  followThroughResolved,
  followThroughStatusLabel,
  followThroughStatusTone,
  type FollowThroughKind,
} from "@/lib/applications/follow-through";
import { TASK_STATUS_LABELS } from "@/lib/constants/tasks";
import { STAGE_LABELS } from "@/lib/constants/applications";
import { formatCalendarDate, formatDate } from "@/lib/utils";
import type { getApplicationFollowThrough } from "@/lib/db/queries";
import { ArrowLink } from "@/components/ui/arrow-link";
import { StatusChip } from "@/components/ui/status-chip";
import { ApplicationWorkspaceTabs } from "@/components/applications/application-workspace-tabs";
import { Timeline } from "@/components/structure/timeline";

type Data = NonNullable<
  Awaited<ReturnType<typeof getApplicationFollowThrough>>
>;
type Item = Data["items"][number];
type Result = { error?: string; data?: Data | null };
const panel = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4";
const link =
  "text-sm font-medium text-primary-700 underline underline-offset-2";
const field =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
const labels = {
  receipt: "Application acknowledgment",
  portal: "Applicant portal",
  material: "Material",
};
function TrackingEditor({
  data,
  item,
  kind,
  onClose,
  onSaved,
}: {
  data: Data;
  item?: Item;
  kind: FollowThroughKind;
  onClose: () => void;
  onSaved: (data: Data) => void;
}) {
  const id = useId();
  const [form, setForm] = useState({
    title: item?.title ?? (kind === "material" ? "" : labels[kind]),
    status: item?.status ?? FOLLOW_THROUGH_STATUSES[kind][0][0],
    sentOn: item?.sent_on ?? "",
    receivedOn: item?.received_on ?? "",
    checkedOn: item?.checked_on ?? "",
    portalUrl: item?.portal_url ?? "",
    notes: item?.notes ?? "",
    documentId: item?.attachmentUnavailable
      ? "keep"
      : (item?.evidence_document_id ?? ""),
  });
  const [original] = useState(JSON.stringify(form)),
    dirty = original !== JSON.stringify(form);
  const [discard, setDiscard] = useState(false),
    [error, setError] = useState(""),
    [pending, start] = useTransition();
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const change = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDiscard(false);
  };
  return (
    <Modal
      open
      trapFocus
      onClose={close}
      title={`${item ? "Edit" : "Add"} ${labels[kind].toLowerCase()}`}
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            try {
              const result = await saveApplicationTracking({
                ...form,
                applicationId: data.application.id,
                id: item?.id,
                revision: item?.revision ?? 0,
                kind,
                sentOn: form.sentOn || null,
                receivedOn: form.receivedOn || null,
                checkedOn: form.checkedOn || null,
                documentId:
                  form.documentId === "keep"
                    ? undefined
                    : form.documentId || null,
              });
              if (result.error) setError(result.error);
              else if (result.data) {
                onSaved(result.data);
                onClose();
              }
            } catch {
              setError("Unable to save. Your edits are still here; try again.");
            }
          });
        }}
      >
        <p className="text-sm text-gray-600">
          Shared with the student and counseling team. Changes pause parent
          access until the student shares this item again.
        </p>
        <fieldset disabled={pending} className="space-y-4">
          <label className="block text-sm font-medium" htmlFor={`${id}-title`}>
            Item name
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
            Tracking status
            <select
              id={`${id}-status`}
              aria-label="Tracking status"
              className={field}
              value={form.status}
              onChange={(e) => {
                change("status", e.target.value);
                if (e.target.value !== "received") change("receivedOn", "");
              }}
            >
              {FOLLOW_THROUGH_STATUSES[kind].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === "material" && (
              <label
                className="block text-sm font-medium"
                htmlFor={`${id}-sent`}
              >
                Date sent
                <input
                  id={`${id}-sent`}
                  className={field}
                  type="date"
                  max={data.today}
                  required={form.status === "sent"}
                  value={form.sentOn}
                  onChange={(e) => change("sentOn", e.target.value)}
                />
              </label>
            )}
            {form.status === "received" && (
              <label
                className="block text-sm font-medium"
                htmlFor={`${id}-received`}
              >
                Receipt confirmed on
                <input
                  id={`${id}-received`}
                  className={field}
                  type="date"
                  max={data.today}
                  required
                  value={form.receivedOn}
                  onChange={(e) => change("receivedOn", e.target.value)}
                />
              </label>
            )}
            <label
              className="block text-sm font-medium"
              htmlFor={`${id}-checked`}
            >
              Last checked
              <input
                id={`${id}-checked`}
                className={field}
                type="date"
                max={data.today}
                value={form.checkedOn}
                onChange={(e) => change("checkedOn", e.target.value)}
              />
            </label>
          </div>
          {kind === "portal" && (
            <label className="block text-sm font-medium" htmlFor={`${id}-url`}>
              Applicant portal address
              <input
                id={`${id}-url`}
                aria-label="Applicant portal address"
                className={field}
                type="url"
                placeholder="https://"
                value={form.portalUrl}
                onChange={(e) => change("portalUrl", e.target.value)}
              />
              <span className="font-normal text-gray-600">
                Use the public login address. Keep passwords and sign-in tokens
                out of this workspace.
              </span>
            </label>
          )}
          <label className="block text-sm font-medium" htmlFor={`${id}-notes`}>
            Tracking notes or confirmation reference
            <textarea
              id={`${id}-notes`}
              aria-label="Tracking notes or confirmation reference"
              className={field}
              rows={3}
              maxLength={4000}
              value={form.notes}
              onChange={(e) => change("notes", e.target.value)}
            />
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
              {item?.attachmentUnavailable && (
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
            <span className="font-normal text-gray-600">
              Upload documents in Documents first. Linking keeps each document’s
              own sharing permissions.
            </span>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={pending}>
            Save tracking
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
              Discard tracking edits
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
              const r = await createApplicationFollowUp({
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
export function ApplicationFollowThrough({
  initialData,
}: {
  initialData: Data;
}) {
  const [data, setData] = useState(initialData),
    [editor, setEditor] = useState<{
      kind: FollowThroughKind;
      item?: Item;
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, start] = useTransition();
  const editable = data.canEdit && data.submitted;
  const result = (r: Result) => {
    if (r.error) setError(r.error);
    else if (r.data) {
      setData(r.data);
      setNotice("Follow-through updated.");
    }
  };
  const timeline = data.items
    .flatMap((item) => [
      ...(item.sent_on
        ? [
            {
              id: `${item.id}-sent`,
              date: item.sent_on,
              label: `${item.title}: sent`,
              tone: "active" as const,
            },
          ]
        : []),
      ...(item.received_on
        ? [
            {
              id: `${item.id}-received`,
              date: item.received_on,
              label: `${item.title}: receipt confirmed`,
              tone: "done" as const,
            },
          ]
        : []),
      ...(item.checked_on
        ? [
            {
              id: `${item.id}-checked`,
              date: item.checked_on,
              label: `${item.title}: last checked`,
              tone: "neutral" as const,
            },
          ]
        : []),
    ])
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label),
    );
  return (
    <PageShell
      title="Application follow-through"
      description={`${data.application.student} · ${data.application.college}`}
    >
      <div className="mx-auto min-w-0 max-w-5xl space-y-6 break-words [overflow-wrap:anywhere]">
        <ApplicationWorkspaceTabs
          applicationId={data.application.id}
          studentId={data.application.studentId}
          surface={data.surface}
          current="follow"
          extra={<ArrowLink href={data.documentsHref}>Documents</ArrowLink>}
        />
        <div className={panel}>
          <p className="font-medium">
            Application status:{" "}
            {STAGE_LABELS[data.application.stage] ?? data.application.stage}
          </p>
          <p className="text-sm text-gray-600">
            Record what the college confirms after submission. Sending a
            document, completing a task, and receiving an acknowledgment are
            separate steps.
          </p>
          {data.surface === "family" ? (
            <p className="text-sm">
              You see items the student has approved for parents. Open a
              follow-up assigned to you to mark your work complete. Documents
              and submission packets retain their own sharing controls.
            </p>
          ) : (
            <p className="text-sm">
              Tracking starts with student and counselor access. Only the
              student can share each item with parents. Editing an item pauses
              parent access, including its tasks and reminders, until the
              student shares it again.
            </p>
          )}
          {!data.submitted && (
            <p className="text-sm font-medium">
              Record submission in the handoff or application tracker before
              adding follow-through. Follow-up reminders pause when the
              application is no longer submitted. You can still withdraw parent
              sharing.
            </p>
          )}
          {editable && (
            <div className="flex flex-wrap gap-3">
              {(["receipt", "portal", "material"] as const)
                .filter(
                  (kind) =>
                    kind === "material" ||
                    !data.items.some((i) => i.kind === kind),
                )
                .map((kind) => (
                  <Button
                    variant="outline"
                    key={kind}
                    onClick={() => setEditor({ kind })}
                  >
                    Add {labels[kind].toLowerCase()}
                  </Button>
                ))}
            </div>
          )}
        </div>
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
              ? "No follow-through items are currently shared with you."
              : "No follow-through items yet. Start with the application acknowledgment, then track the portal and required materials."}
          </p>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {data.items.map((item) => {
            const open = item.tasks.some(
              (t) => !["completed", "cancelled"].includes(t.status),
            );
            return (
              <section
                key={item.id}
                id={`tracking-${item.id}`}
                aria-labelledby={`tracking-title-${item.id}`}
                className={panel}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2
                    id={`tracking-title-${item.id}`}
                    className="text-base font-semibold text-gray-900"
                  >
                    {item.title}
                  </h2>
                  <StatusChip tone={followThroughStatusTone(item.kind, item.status)}>
                    {followThroughStatusLabel(item.kind, item.status)}
                  </StatusChip>
                </div>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  {[
                    ["Sent", item.sent_on],
                    ["Receipt confirmed", item.received_on],
                    ["Last checked", item.checked_on],
                  ].map(([label, date]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs text-gray-600">
                        <span
                          aria-hidden="true"
                          className={`mb-2 block h-1 rounded-full ${date ? "bg-primary-500" : "bg-gray-200"}`}
                        />
                        {label}
                      </dt>
                      <dd className={date ? "tabular-nums text-gray-900" : "text-gray-500"}>
                        {date ? formatCalendarDate(date) : "Not recorded"}
                      </dd>
                    </div>
                  ))}
                </dl>
                {item.portal_url && (
                  <a
                    className={`${link} inline-block break-all`}
                    href={item.portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open applicant portal
                  </a>
                )}
                {item.notes && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {item.notes}
                  </p>
                )}
                {item.evidence && (
                  <Link
                    className={`${link} block break-words`}
                    href={item.evidence.href}
                  >
                    Supporting document: {item.evidence.title}
                  </Link>
                )}
                {item.attachmentUnavailable && (
                  <p className="text-sm text-gray-500">
                    The attached document is currently unavailable. Its sharing
                    has not changed.
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Updated {formatDate(item.updated_at)}
                </p>
                {data.surface !== "family" && (
                  <p className="text-sm text-gray-600">
                    {item.family_shared
                      ? "Shared with parents by the student"
                      : "Student and counseling team only"}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {editable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditor({ kind: item.kind, item })}
                    >
                      Edit tracking
                    </Button>
                  )}
                  {data.surface === "student" &&
                    (data.submitted || item.family_shared) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          setError("");
                          start(async () => {
                            try {
                              result(
                                await shareApplicationTracking({
                                  applicationId: data.application.id,
                                  id: item.id,
                                  revision: item.revision,
                                  shared: !item.family_shared,
                                }),
                              );
                            } catch {
                              setError("Unable to change sharing. Try again.");
                            }
                          });
                        }}
                      >
                        {item.family_shared
                          ? "Stop sharing with parents"
                          : "Share item with parents"}
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
                        {editable &&
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
                        <p>
                          {t.owner} · {TASK_STATUS_LABELS[t.status] ?? t.status}{" "}
                          ·{" "}
                          {t.dueOn
                            ? `Due ${formatCalendarDate(t.dueOn)}`
                            : "No due date"}
                        </p>
                        {!["completed", "cancelled"].includes(t.status) &&
                          t.dueOn &&
                          t.dueOn < data.today && (
                            <p className="font-medium text-danger-700">
                              Overdue
                            </p>
                          )}
                        {t.status === "cancelled" &&
                          followThroughResolved(item.kind, item.status) && (
                            <p>Item resolved; no further reminders.</p>
                          )}
                        {t.parentOwner &&
                          !item.family_shared &&
                          !["completed", "cancelled"].includes(t.status) && (
                            <p>
                              Parent access and reminders paused until the
                              student shares this item.
                            </p>
                          )}
                      </div>
                    ))}
                  </div>
                )}
                {editable &&
                  !open &&
                  !followThroughResolved(item.kind, item.status) && (
                    <FollowUpForm data={data} item={item} onResult={result} />
                  )}
              </section>
            );
          })}
        </div>
        {timeline.length > 0 && (
          <section className={panel} aria-labelledby="tracking-timeline">
            <h2 id="tracking-timeline" className="text-lg font-semibold">
              Recorded milestones
            </h2>
            <p className="text-sm text-gray-600">
              Dates from the tracking items visible to you.
            </p>
            <Timeline
              label="Recorded milestones"
              items={timeline.map((event) => ({
                id: event.id,
                date: formatCalendarDate(event.date),
                title: event.label,
                tone: event.tone,
              }))}
            />
          </section>
        )}
        {editor && (
          <TrackingEditor
            key={editor.item?.id ?? editor.kind}
            data={data}
            item={editor.item}
            kind={editor.kind}
            onClose={() => setEditor(null)}
            onSaved={(d) => {
              setData(d);
              setNotice(
                "Tracking saved. Parent sharing requires a fresh student approval after changes.",
              );
            }}
          />
        )}
      </div>
    </PageShell>
  );
}

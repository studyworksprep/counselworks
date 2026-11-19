"use client";
import { buttonClasses } from "@/components/ui/button-styles";
import { Icon } from "@/components/ui/icon";

import { useState, useTransition } from "react";
import { ArrowLink } from "@/components/ui/arrow-link";
import { StatusIcon } from "@/components/ui/status-chip";
import { ApplicationWorkspaceTabs } from "@/components/applications/application-workspace-tabs";
import { ProcessSteps, type ProcessStep } from "@/components/structure/process-steps";
import { SignOffPair } from "@/components/structure/sign-off";
import { WordMeter } from "@/components/structure/word-meter";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import {
  prepareApplicationPacket,
  previewApplicationReview,
  updateApplicationPacket,
} from "@/lib/actions/application-review";
import {
  SUBMISSION_PLATFORMS,
  type PacketEssay,
  type REVIEW_ACTIONS,
} from "@/lib/applications/final-review";
import { essayPlanningPath } from "@/lib/essays/planning";
import { STAGE_LABELS } from "@/lib/constants/applications";
import { formatCalendarDate, formatDate, humanizeToken } from "@/lib/utils";
import type { getApplicationFinalReview } from "@/lib/db/queries";

type Data = NonNullable<Awaited<ReturnType<typeof getApplicationFinalReview>>>;
const panel = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4";
const field = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";

function Responses({
  essays,
  copy,
}: {
  essays: PacketEssay[];
  copy?: (body: string) => void;
}) {
  return (
    <div className="space-y-3">
      {!essays.length && (
        <p className="text-sm text-gray-600">
          No writing responses are included. Confirm that this college does not
          require a personal statement or supplemental response.
        </p>
      )}
      {essays.map((e) => (
        <details
          key={e.id}
          className="rounded-lg border border-gray-200 p-4"
          open
        >
          <summary className="cursor-pointer font-medium">
            {e.title}{" "}
            <span className="text-sm font-normal text-gray-600">
              · saved version {e.version}
            </span>
          </summary>
          <WordMeter
            className="mt-3 max-w-md"
            words={e.words}
            limit={e.wordLimit}
            characters={e.characters}
            characterLimit={e.characterLimit}
          />
          {e.general && (
            <p className="mt-2 text-xs text-gray-600">
              General essay selected for this application
            </p>
          )}
          {e.prompt && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">
              {e.prompt}
            </p>
          )}
          <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-gray-900">
            {e.body || "No saved writing yet."}
          </div>
          {copy && (
            <Button icon="copy"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => copy(e.body)}
              aria-label={`Copy response: ${e.title}`}
            >
              Copy response only
            </Button>
          )}
        </details>
      ))}
    </div>
  );
}

export function FinalApplicationReview({ initialData }: { initialData: Data }) {
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState(
    initialData.preview?.manifest.generalEssayIds ?? [],
  );
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedOn, setSubmittedOn] = useState(initialData.today);
  const [platform, setPlatform] =
    useState<(typeof SUBMISSION_PLATFORMS)[number]>("Common App");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const { application: app, preview, surface } = data;
  const family = surface === "family",
    student = surface === "student",
    packet = data.packets[0];
  const dirty =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...(preview?.manifest.generalEssayIds ?? [])].sort());
  const active = !["withdrawn", "under_review", "decision_received"].includes(
    app.stage,
  );
  const ready =
    !!packet?.student_approved_at &&
    !!packet.counselor_approved_at &&
    packet.current === true;
  const canApprove =
    data.canEdit &&
    active &&
    !!packet?.current &&
    !preview?.blockers.length &&
    !dirty &&
    !packet.submitted_on;
  const mine = student
    ? packet?.student_approved_at
    : packet?.counselor_approved_at;
  const refresh = async () => {
    const result = await previewApplicationReview({
      applicationId: app.id,
      generalEssayIds: selected,
    });
    if (result.error || !result.data)
      throw new Error(result.error || "Unable to refresh review");
    setData(result.data);
    setConfirmed(false);
    setSubmitted(false);
  };
  const run = (work: () => Promise<void>) => {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await work();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to save. Try again.",
        );
      }
    });
  };
  const act = (action: (typeof REVIEW_ACTIONS)[number]) =>
    run(async () => {
      if (!packet) return;
      const result = await updateApplicationPacket({
        applicationId: app.id,
        packetId: packet.id,
        revision: packet.revision,
        action,
        confirmed: true,
        ...(action === "submit"
          ? { submittedOn, platform, confirmation: reference }
          : {}),
      });
      if (result.error) throw new Error(result.error);
      await refresh();
      setMessage(
        action === "submit"
          ? "Submission recorded. The college's receipt remains your confirmation of delivery."
          : "Review updated.",
      );
    });
  const copy = (body: string) => {
    void navigator.clipboard.writeText(body).then(
      () => setMessage("Response copied."),
      () =>
        setError(
          "Copy was unavailable. Select the response text or download the packet.",
        ),
    );
  };
  const statusNote = `Application status: ${STAGE_LABELS[app.stage] ?? humanizeToken(app.stage)}. CounselWorks does not submit to colleges. The student submits in the application portal and records the result here.`;
  // Where the three-part handoff stands (prepare → approve → submit).
  const recorded = !!packet?.submitted_on;
  const blockers = preview?.blockers.length ?? 0;
  const processSteps: ProcessStep[] = [
    {
      key: "materials",
      title: "Review materials",
      state: recorded || packet?.current ? "done" : blockers ? "attention" : "current",
      detail:
        recorded || packet?.current
          ? `Packet ${packet!.number} prepared ${formatDate(packet!.created_at)}`
          : blockers
            ? `${blockers} ${blockers === 1 ? "item" : "items"} to resolve`
            : packet
              ? "Materials changed — prepare an updated packet"
              : "Prepare a review packet",
    },
    {
      key: "approve",
      title: "Approve the packet",
      state: recorded || ready ? "done" : packet?.current ? "current" : "upcoming",
      detail:
        recorded || ready
          ? "Student and counselor approved"
          : !packet?.current
            ? "After the packet is prepared"
            : packet.student_approved_at
              ? "Student approved · awaiting counselor"
              : packet.counselor_approved_at
                ? "Counselor approved · awaiting student"
                : "Awaiting both approvals",
    },
    {
      key: "submit",
      title: "Submit in the portal",
      state: recorded ? "done" : ready ? "current" : "upcoming",
      detail: recorded
        ? `Recorded ${formatCalendarDate(packet!.submitted_on!)}`
        : ready
          ? "Student submits and records it"
          : "After both approvals",
    },
  ];
  return (
    <PageShell
      title="Final application review"
      description={`${app.studentName} · ${app.college}`}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <ApplicationWorkspaceTabs
          applicationId={app.id}
          studentId={app.studentId}
          surface={surface}
          current="review"
          extra={
            <>
              <ArrowLink href={essayPlanningPath(app.studentId, surface)}>
                Essay planning board
              </ArrowLink>
              {surface === "staff" && (
                <ArrowLink href={`/applications/${app.id}`}>
                  Application checklist
                </ArrowLink>
              )}
            </>
          }
        />
        {family ? (
          <p className="text-sm text-gray-600">{statusNote}</p>
        ) : (
          <section
            aria-label="Review progress"
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <ProcessSteps label="Final review steps" steps={processSteps} />
            <p className="mt-4 flex items-start gap-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
              <StatusIcon name="circle" className="mt-1 h-3 w-3 text-gray-500" />
              {statusNote}
            </p>
          </section>
        )}
        {message && (
          <p
            role="status"
            className="rounded-lg bg-success-50 p-3 text-sm text-success-800"
          >
            {message}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800"
          >
            {error}
          </p>
        )}
        {family ? (
          <div className={panel}>
            <h2 className="text-lg font-semibold">Family handoff view</h2>
            <p className="text-sm text-gray-600">
              Final review belongs to the student and counseling team. You can
              read a packet only after the student approves parent access and
              every included essay still permits family sharing. Private notes,
              feedback and source interviews stay private.
            </p>
            {!packet && (
              <p className="text-sm">
                No submission packet is currently shared with you.
              </p>
            )}
            {app.submittedAt && !packet?.submitted_on && (
              <p className="text-sm">
                The application tracker records a submission on{" "}
                {formatDate(app.submittedAt)}. A shared packet confirmation is
                not available here.
              </p>
            )}
          </div>
        ) : (
          <section className={panel} aria-labelledby="review-materials">
            <h2 id="review-materials" className="text-lg font-semibold">
              1. Review the application materials
            </h2>
            <p className="text-sm text-gray-600">
              Linked responses are included automatically. Select any general
              essay this college requires. Save the current writing in each
              essay editor before preparing a packet.
            </p>
            {!!data.generalEssays.length && (
              <fieldset
                className="space-y-2"
                disabled={pending || !data.canEdit || !!packet?.submitted_on}
              >
                <legend className="mb-2 text-sm font-semibold">
                  General essays to include
                </legend>
                {data.generalEssays.map((e) => (
                  <label key={e.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.includes(e.id)}
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, e.id]
                            : ids.filter((id) => id !== e.id),
                        )
                      }
                    />
                    {e.title}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button icon="refresh"
                variant="outline"
                loading={pending}
                onClick={() => run(refresh)}
              >
                Refresh review checks
              </Button>
              {dirty && (
                <p className="text-sm text-warning-800">
                  Refresh to review your changed essay selection.
                </p>
              )}
            </div>
            {!!preview?.blockers.length && (
              <div className="rounded-lg bg-danger-50 p-4">
                <h3 className="font-medium text-danger-900">
                  Resolve before approval
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger-800">
                  {preview.blockers.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-sm">
                  Use the essay planning board for writing and revision tasks,
                  or ask your counselor to update the application checklist.
                </p>
              </div>
            )}
            <div className="rounded-lg bg-warning-50 p-4 text-sm text-warning-900">
              <h3 className="font-medium">
                Check against the application portal
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {(preview?.warnings ?? []).map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
                <li>
                  Confirm program-specific questions, selected optional
                  responses, the personal statement, recommendations, fees and
                  all non-writing requirements.
                </li>
                <li>
                  Check the portal&apos;s word and character counters and final
                  formatting after pasting.
                </li>
              </ul>
            </div>
            {preview && <Responses essays={preview.manifest.essays} />}
            {data.canEdit && active && !packet?.submitted_on && (
              <Button icon="readiness"
                loading={pending}
                disabled={
                  dirty ||
                  !preview ||
                  !!preview.blockers.length ||
                  !!packet?.current
                }
                onClick={() =>
                  run(async () => {
                    if (!preview) return;
                    const result = await prepareApplicationPacket({
                      applicationId: app.id,
                      generalEssayIds: selected,
                      fingerprint: preview.fingerprint,
                    });
                    if (result.error) throw new Error(result.error);
                    await refresh();
                    setMessage(
                      "Packet prepared. Student and counselor can now review and approve these exact saved versions.",
                    );
                  })
                }
              >
                {packet ? "Prepare updated packet" : "Prepare review packet"}
              </Button>
            )}
          </section>
        )}

        {packet && (
          <section className={panel} aria-labelledby="packet-approval">
            <div className="flex flex-wrap justify-between gap-3">
              <h2 id="packet-approval" className="text-lg font-semibold">
                {family ? "Shared packet" : "2. Approve the saved packet"} ·
                Packet {packet.number}
              </h2>
              <span className="text-sm text-gray-600">
                Prepared {formatDate(packet.created_at)}
              </span>
            </div>
            {packet.current === false && !packet.submitted_on && (
              <p
                role="status"
                className="rounded-lg bg-warning-50 p-3 text-sm text-warning-900"
              >
                Outdated packet. Application materials or review checks changed.
                Earlier approvals apply only to the saved packet below; prepare
                an updated packet for a fresh review.
              </p>
            )}
            <SignOffPair
              items={[
                {
                  label: "Student approval",
                  done: !!packet.student_approved_at,
                  detail: packet.student_approved_at
                    ? `Approved ${formatDate(packet.student_approved_at)}`
                    : "Awaiting student approval",
                },
                {
                  label: "Counselor approval",
                  done: !!packet.counselor_approved_at,
                  detail: packet.counselor_approved_at
                    ? `Approved ${formatDate(packet.counselor_approved_at)}`
                    : "Awaiting counselor approval",
                },
              ]}
            />
            <Responses essays={packet.manifest.essays} copy={copy} />
            {canApprove && !mine && (
              <div className="space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    disabled={pending}
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {student
                    ? "I reviewed these exact saved responses, confirm they represent my own work, and checked the application requirements and selected responses."
                    : "I reviewed these exact saved responses and checked current college requirements, limits, optional/program-specific responses and non-writing requirements against the application portal."}
                </label>
                <Button icon="approve"
                  loading={pending}
                  disabled={!confirmed}
                  onClick={() =>
                    act(student ? "approve_student" : "approve_counselor")
                  }
                >
                  {student ? "Approve as student" : "Approve as counselor"}
                </Button>
              </div>
            )}
            {!family && data.canEdit && mine && !packet.submitted_on && (
              <Button icon="reject"
                variant="outline"
                loading={pending}
                onClick={() =>
                  act(student ? "withdraw_student" : "withdraw_counselor")
                }
              >
                Withdraw my approval
              </Button>
            )}
            {student && packet.student_approved_at && (
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold">
                  Parent access to this packet
                </h3>
                <p className="text-sm text-gray-600">
                  {packet.family_shared
                    ? "Parent sharing is enabled. Access pauses if an included essay changes or family access is withdrawn."
                    : "This packet is private to you and your counseling team. Sharing an essay alone does not share this packet."}
                </p>
                <Button icon={packet.family_shared ? "undo" : "families"}
                  variant="outline"
                  loading={pending}
                  disabled={!packet.family_shared && (!packet.current || dirty)}
                  onClick={() =>
                    act(packet.family_shared ? "unshare" : "share")
                  }
                >
                  {packet.family_shared
                    ? "Stop sharing packet with parents"
                    : "Share approved packet with parents"}
                </Button>
              </div>
            )}
            {packet.student_approved_at &&
              packet.counselor_approved_at &&
              (packet.current !== false || packet.submitted_on) && (
                <a
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                  href={`/api/application-packets/${packet.id}?application=${app.id}`}
                  download
                >
                  <Icon name="download" className="h-4 w-4 text-primary-600" />
                  Download clean submission packet (.txt)
                </a>
              )}
            <p className="text-xs text-gray-500">
              The packet includes prompts and response text only. Copy buttons
              copy just the response. Approvals do not confirm that a college
              has received an application.
            </p>
          </section>
        )}

        {packet && (
          <section className={panel} aria-labelledby="submission-handoff">
            <h2 id="submission-handoff" className="text-lg font-semibold">
              {family
                ? "Submission record"
                : "3. Submit in the application portal"}
            </h2>
            {packet.submitted_on ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-success-800">
                  Student recorded submission on{" "}
                  {formatCalendarDate(packet.submitted_on)} via{" "}
                  {packet.submission_platform}.
                </p>
                {packet.submission_confirmation && (
                  <p>
                    Confirmation reference: {packet.submission_confirmation}
                  </p>
                )}
                <p>
                  Recorded {formatDate(packet.recorded_at!)} for packet{" "}
                  {packet.number}. Keep the college&apos;s receipt; this is a
                  student-reported record.
                </p>
                {packet.current === false && !family && (
                  <p className="text-warning-800">
                    Current workspace materials differ from the submitted
                    snapshot. The recorded packet and approvals are preserved.
                  </p>
                )}
              </div>
            ) : student && ready && !dirty && active ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (submitted) act("submit");
                }}
              >
                <p className="text-sm text-gray-600">
                  Copy the approved responses, check the final preview, and
                  submit through the college&apos;s application platform. Return
                  here after submission.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Submission date
                    <input
                      className={field}
                      type="date"
                      required
                      min={packet.preparedOn}
                      max={data.today}
                      value={submittedOn}
                      onChange={(e) => setSubmittedOn(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    Application platform
                    <select
                      className={field}
                      value={platform}
                      onChange={(e) =>
                        setPlatform(e.target.value as typeof platform)
                      }
                    >
                      {SUBMISSION_PLATFORMS.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  Confirmation reference (optional)
                  <input
                    className={field}
                    maxLength={200}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Receipt or confirmation number"
                  />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    disabled={pending}
                    checked={submitted}
                    onChange={(e) => setSubmitted(e.target.checked)}
                    required
                  />
                  I submitted this packet&apos;s exact responses in the
                  application portal and received its confirmation. I understand
                  that this record cannot be edited.
                </label>
                <Button icon="stageSubmitted" type="submit" loading={pending} disabled={!submitted}>
                  Record my submission
                </Button>
              </form>
            ) : (
              <p className="text-sm text-gray-600">
                {family
                  ? "The student has not shared a packet submission confirmation here."
                  : ready
                    ? "The approved packet is ready for the student to submit and record the result from their portal."
                    : "Student and counselor approval of the current packet is required before recording a submission."}
              </p>
            )}
          </section>
        )}
        {!family && data.packets.length > 1 && (
          <details className={panel}>
            <summary className="cursor-pointer font-medium">
              Earlier packets
            </summary>
            <p className="text-sm text-gray-600">
              Earlier approvals remain tied to their original writing. Only the
              latest current packet can be used for a new handoff. Showing the
              20 most recent packets.
            </p>
            {data.packets.slice(1).map((old) => (
              <details key={old.id} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Packet {old.number} · {formatDate(old.created_at)} · Student{" "}
                  {old.student_approved_at ? "approved" : "not approved"} ·
                  Counselor{" "}
                  {old.counselor_approved_at ? "approved" : "not approved"}
                </summary>
                <div className="mt-3">
                  <Responses essays={old.manifest.essays} />
                </div>
              </details>
            ))}
          </details>
        )}
      </div>
    </PageShell>
  );
}

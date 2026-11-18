import Link from "next/link";
import { cn, formatCalendarDate, formatDate, humanizeToken, isOverdue } from "@/lib/utils";
import {
  DECISION_LABELS,
  DECISION_TONES,
  ROUND_FULL_LABELS,
  parseChecklist,
} from "@/lib/constants/applications";
import { StatusChip } from "@/components/ui/status-chip";
import { StageTrack } from "@/components/structure/stage-track";
import { ProgressBar } from "@/components/structure/progress-bar";
import { Checklist } from "@/components/structure/checklist";

export interface ApplicationCardData {
  id: string;
  college_name: string;
  student_college_id: string | null;
  stage: string;
  application_type: string;
  deadline_at: string | null;
  submitted_at: string | null;
  decision_result: string | null;
  checklist_json: unknown;
}

type Phase = "review" | "follow" | "decision";

/** The lifecycle view that matches the application's stage. */
function currentPhase(stage: string): Phase | null {
  if (stage === "decision_received") return "decision";
  if (stage === "submitted" || stage === "under_review") return "follow";
  if (stage === "withdrawn") return null;
  return "review";
}

const ICONS: Record<Phase, React.ReactNode> = {
  review: (
    <>
      <rect x="4.5" y="3.5" width="11" height="14" rx="2" />
      <path d="M7.5 3.5V2.5h5v1" />
      <path d="M7.5 11l1.8 1.8 3.4-3.6" />
    </>
  ),
  follow: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M3 5.5l7 5 7-5" />
    </>
  ),
  decision: (
    <>
      <path d="M5 17.5V3" />
      <path d="M5 3.5h10l-2.2 3.75L15 11H5" />
    </>
  ),
};

/**
 * One application in a portal list (design refresh, phase 2): stage track,
 * deadline and requirement progress, the checklist on demand, and the three
 * lifecycle views with the current one highlighted.
 */
export function ApplicationCard({
  app,
  surface,
}: {
  app: ApplicationCardData;
  surface: "student" | "family";
}) {
  const base = surface === "student" ? "/student-applications" : "/family-applications";
  const collegeBase = surface === "student" ? "/student-colleges" : "/family-colleges";
  const checklist = parseChecklist(app.checklist_json) ?? [];
  const done = checklist.filter((item) => item.done).length;
  const decided = app.stage === "decision_received" || app.stage === "withdrawn";
  const overdue =
    !!app.deadline_at && !app.submitted_at && !decided && isOverdue(app.deadline_at);
  const phase = currentPhase(app.stage);
  const views: { key: Phase; href: string; label: string }[] = [
    { key: "review", href: `${base}/${app.id}/review`, label: "Final review" },
    { key: "follow", href: `${base}/${app.id}/follow-through`, label: "Follow-through" },
    { key: "decision", href: `${base}/${app.id}/decisions`, label: "Decision" },
  ];

  return (
    <article
      id={`application-${app.id}`}
      aria-labelledby={`application-title-${app.id}`}
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id={`application-title-${app.id}`}
              className="break-words text-base font-semibold text-gray-900"
            >
              {app.student_college_id ? (
                <Link
                  prefetch={false}
                  href={`${collegeBase}/${app.student_college_id}`}
                  className="underline-offset-2 hover:text-primary-700 hover:underline"
                >
                  {app.college_name}
                </Link>
              ) : (
                app.college_name
              )}
            </h3>
            <p className="mt-0.5 text-xs text-gray-600">
              {ROUND_FULL_LABELS[app.application_type] ??
                humanizeToken(app.application_type)}
            </p>
          </div>
          {app.decision_result && (
            <StatusChip tone={DECISION_TONES[app.decision_result] ?? "neutral"}>
              {DECISION_LABELS[app.decision_result] ??
                humanizeToken(app.decision_result)}
            </StatusChip>
          )}
        </div>
        <StageTrack stage={app.stage} />
      </div>

      <dl className="border-t border-gray-100 px-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2.5">
          <dt className="text-gray-600">Deadline</dt>
          <dd className="flex flex-wrap items-center justify-end gap-2">
            <span className="font-medium tabular-nums text-gray-900">
              {app.deadline_at ? formatCalendarDate(app.deadline_at) : "Not recorded"}
            </span>
            {app.submitted_at ? (
              <StatusChip tone="done">Submitted {formatDate(app.submitted_at)}</StatusChip>
            ) : overdue ? (
              <StatusChip tone="problem">Overdue</StatusChip>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <dt className="text-gray-600">Requirements</dt>
          <dd className="flex min-w-[9rem] flex-1 items-center justify-end gap-2.5">
            {checklist.length ? (
              <>
                <ProgressBar
                  className="max-w-24 flex-1"
                  label="Requirements"
                  value={done}
                  max={checklist.length}
                  caption={false}
                  tone={done === checklist.length ? "done" : "active"}
                  size="sm"
                />
                <span className="font-medium tabular-nums text-gray-900">
                  {done} of {checklist.length}
                </span>
              </>
            ) : (
              <span className="text-gray-600">Not set up yet</span>
            )}
          </dd>
        </div>
      </dl>

      {checklist.length > 0 && (
        <details className="group border-t border-gray-100 px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
            Application checklist
          </summary>
          <Checklist items={checklist} showProgress={false} className="pb-1" />
        </details>
      )}

      <nav
        aria-label={`${app.college_name} application views`}
        className="@container mt-auto grid grid-cols-3 border-t border-gray-200"
      >
        {views.map((view, index) => {
          const current = view.key === phase;
          return (
            <Link
              key={view.key}
              href={view.href}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center justify-center gap-1.5 px-2 py-3 text-center text-[13px] leading-tight transition-colors",
                index < views.length - 1 && "border-r border-gray-200",
                current
                  ? "bg-primary-50 font-semibold text-primary-800"
                  : "font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                // Icons only when the card is wide enough to keep each
                // label on one line (three-column grids are ~350px wide).
                className="hidden h-4 w-4 shrink-0 @md:block"
              >
                {ICONS[view.key]}
              </svg>
              {view.label}
            </Link>
          );
        })}
      </nav>
    </article>
  );
}

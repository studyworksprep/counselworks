import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusChip } from "@/components/ui/status-chip";
import { BADGE_VARIANT_TONES } from "@/lib/constants/tones";
import { STUDENT_STATUS_BADGES, STUDENT_STATUS_LABELS } from "@/lib/constants/students";
import {
  DECISION_LABELS,
  DECISION_TONES,
  ROUND_SHORT_LABELS,
  STAGE_LABELS,
  STAGE_TONES,
} from "@/lib/constants/applications";
import type { ChildApplicationSummary } from "@/lib/family/dashboard";
import { cn, formatCalendarDate, formatDateTime, humanizeToken } from "@/lib/utils";

export interface ChildSummaryProps {
  child: {
    id: string;
    first_name: string;
    last_name: string;
    school_name: string | null;
    graduation_year: number | null;
    status: string;
  };
  applications: ChildApplicationSummary;
  nextMeeting: { title: string; scheduled_start_at: string; location_text: string | null } | null;
  plan: { completed: number; total: number } | null;
  /** The only child in the household: the card spans the row, facts in four columns. */
  wide?: boolean;
}

function roundLabel(round: string) {
  return ROUND_SHORT_LABELS[round] ?? humanizeToken(round);
}

function daysAwayLabel(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  // One wrapper div per dt/dd pair: the only nesting a <dl> allows.
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/**
 * One child at a glance (parent portal rework): where the applications
 * stand, any decisions, the next deadline and meeting, plan progress, and
 * the child's essay planning. Replaces the household-wide stat tiles, which
 * read "0 active applications" for a child holding an acceptance.
 */
export function ChildSummary({ child, applications, nextMeeting, plan, wide = false }: ChildSummaryProps) {
  const next = applications.nextDeadline;
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold break-words text-gray-900">
              {child.first_name} {child.last_name}
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              {child.school_name ? `${child.school_name} · ` : ""}
              Class of {child.graduation_year}
            </p>
          </div>
          <StatusChip
            tone={BADGE_VARIANT_TONES[STUDENT_STATUS_BADGES[child.status] ?? "default"] ?? "neutral"}
          >
            {STUDENT_STATUS_LABELS[child.status] ?? humanizeToken(child.status)}
          </StatusChip>
        </div>

        <dl className={cn("mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2", wide && "xl:grid-cols-4")}>
          <Fact label={`Applications${applications.total ? ` (${applications.total})` : ""}`}>
            {applications.total === 0 ? (
              <span className="text-gray-600">
                None yet.{" "}
                <Link className="text-primary-700 underline" href="/family-colleges">
                  See the college list
                </Link>
              </span>
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {applications.stages.map(({ stage, count }) => (
                  <StatusChip key={stage} tone={STAGE_TONES[stage] ?? "neutral"}>
                    {count} {STAGE_LABELS[stage] ?? humanizeToken(stage)}
                  </StatusChip>
                ))}
              </span>
            )}
          </Fact>

          <Fact label="Next deadline">
            {next ? (
              <>
                <span className="font-medium">{next.college_name}</span>
                <span className="text-gray-600"> · {roundLabel(next.application_type)}</span>
                <span className="block text-xs text-gray-600">
                  {formatCalendarDate(next.deadline_at!)} · {daysAwayLabel(next.daysAway)}
                </span>
              </>
            ) : (
              <span className="text-gray-600">No upcoming application deadlines</span>
            )}
          </Fact>

          {applications.decisions.length > 0 && (
            <Fact label="Decisions" className="sm:col-span-2">
                <ul className="space-y-1.5">
                  {applications.decisions.map((app) => (
                    <li key={app.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium break-words">{app.college_name}</span>
                      <span className="text-xs text-gray-600">{roundLabel(app.application_type)}</span>
                      <StatusChip tone={DECISION_TONES[app.decision_result!] ?? "neutral"}>
                        {DECISION_LABELS[app.decision_result!] ?? humanizeToken(app.decision_result!)}
                      </StatusChip>
                    </li>
                  ))}
                </ul>
            </Fact>
          )}

          <Fact label="Next meeting">
            {nextMeeting ? (
              <>
                <span className="font-medium break-words">{nextMeeting.title}</span>
                <span className="block text-xs text-gray-600">
                  {formatDateTime(nextMeeting.scheduled_start_at)}
                  {nextMeeting.location_text && <> · {nextMeeting.location_text}</>}
                </span>
              </>
            ) : (
              <span className="text-gray-600">
                None scheduled.{" "}
                <Link className="text-primary-700 underline" href="/family-booking">
                  Book a meeting
                </Link>
              </span>
            )}
          </Fact>

          <Fact label="Plan">
            {plan && plan.total > 0 ? (
              <>
                <span>
                  {plan.completed} of {plan.total} steps complete
                </span>
                <span
                  className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.round((plan.completed / plan.total) * 100)}%` }}
                  />
                </span>
                <span className="mt-1 block text-xs text-gray-600">
                  Counts can include your counselor&rsquo;s own steps.
                </span>
              </>
            ) : (
              <span className="text-gray-600">Your counselor will share a plan here.</span>
            )}
          </Fact>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton size="sm" variant="outline" icon="essayPlanning" href={`/family-essay-planning/${child.id}`}>
            Essay planning
          </LinkButton>
          <LinkButton size="sm" variant="outline" icon="applications" href="/family-applications">
            Applications
          </LinkButton>
          {/* Printable point-in-time deliverable (fix plan 10.2) */}
          <LinkButton
            size="sm"
            variant="outline"
            icon="reports"
            href={`/students/${child.id}/progress?auto=0`}
            target="_blank"
          >
            Progress report
          </LinkButton>
        </div>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { collegeWorkspacePath } from "@/lib/colleges/workspace";
import { essayPlanningPath } from "@/lib/essays/planning";
import { ROUND_FULL_LABELS, STAGE_LABELS } from "@/lib/constants/applications";
import {
  ESSAY_STATUS_LABELS,
  ESSAY_STATUS_PORTAL_LABELS,
} from "@/lib/constants/essays";
import { taskPath } from "@/lib/constants/task-links";
import { TASK_STATUS_LABELS, taskOwnerRoleLabel } from "@/lib/constants/tasks";
import { formatCalendarDate, formatDate } from "@/lib/utils";
import { deadlineAttention } from "@/lib/applications/readiness";
import type { getApplicationReadiness } from "@/lib/db/queries";

type Data = NonNullable<Awaited<ReturnType<typeof getApplicationReadiness>>>;
const link =
  "text-sm font-medium text-primary-700 underline underline-offset-2";

export function ApplicationReadiness({ data }: { data: Data }) {
  const family = data.surface === "family";
  const schools = [...data.schools].sort(
    (a, b) =>
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
      a.name.localeCompare(b.name),
  );
  const linkedTaskIds = new Set<string>();
  const cards = schools.map((school) => {
    const app = data.applications.find((a) => a.studentCollegeId === school.id);
    const rows = data.rows.filter((r) => r.schoolId === school.id);
    const visibleEssays = rows.filter((r) => r.essay);
    const essayIds = new Set(visibleEssays.map((r) => r.essay!.id));
    const tasks = data.tasks.filter(
      (t) =>
        t.schoolId === school.id ||
        (app &&
          (t.applicationId === app.id ||
            (t.entityType === "application" && t.entityId === app.id))) ||
        (t.entityType === "essay" && t.entityId && essayIds.has(t.entityId)),
    );
    tasks.forEach((t) => linkedTaskIds.add(t.id));
    return { school, app, rows, visibleEssays, tasks };
  });
  const unlinkedApps = data.applications.filter(
    (app) => !data.schools.some((school) => school.id === app.studentCollegeId),
  );
  const unlinkedCards = unlinkedApps.map((app) => {
    const essays = data.rows.filter(
      (row) => row.essay?.applicationId === app.id,
    );
    const ids = new Set(essays.map((row) => row.essay!.id));
    const tasks = data.tasks.filter(
      (t) =>
        t.applicationId === app.id ||
        (t.entityType === "application" && t.entityId === app.id) ||
        (t.entityType === "essay" && !!t.entityId && ids.has(t.entityId)),
    );
    tasks.forEach((task) => linkedTaskIds.add(task.id));
    return { app, essays, tasks };
  });
  const otherTasks = data.tasks.filter(
    (t) =>
      !linkedTaskIds.has(t.id) &&
      (t.applicationId || t.schoolId ||
        ["application", "essay"].includes(t.entityType ?? "")),
  );
  const generalEssays = data.rows.filter(
    (row) => !row.schoolId && row.essay && !row.essay.applicationId,
  );
  return (
    <div className="space-y-6">
      <nav aria-label="Application workspace" className="flex flex-wrap gap-4">
        <Link
          href={essayPlanningPath(data.student.id, data.surface)}
          className={link}
        >
          Essay planning board
        </Link>
        <Link
          href={
            data.surface === "staff"
              ? `/students/${data.student.id}/colleges`
              : data.surface === "student"
                ? "/student-colleges"
                : "/family-colleges"
          }
          className={link}
        >
          College list
        </Link>
      </nav>
      <p className="max-w-4xl text-sm leading-6 text-gray-600">
        {family
          ? "This is a partial family view. Essays and tasks appear only when shared with you. Missing private work is not counted here."
          : "Review deadlines, requirements, essays and linked tasks together. A checklist or draft status is not confirmation that an application has been submitted."}
      </p>
      {!cards.length && !unlinkedCards.length && (
        <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
          Add a college to begin tracking application readiness.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map(({ school, app, rows, visibleEssays, tasks }) => {
          const required = rows.filter((r) => r.requirement === "required"),
            unassigned = required.filter((r) => !r.essay),
            incomplete = visibleEssays.filter(
              (r) => !["approved", "final"].includes(r.essay!.status),
            );
          const missing = app?.checklist?.filter((item) => !item.done) ?? [];
          const boardUrl = `${essayPlanningPath(data.student.id, data.surface)}?college=${encodeURIComponent(school.id)}`;
          return (
            <section
              key={school.id}
              aria-labelledby={`readiness-${school.id}`}
              className="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2
                    id={`readiness-${school.id}`}
                    className="text-lg font-semibold"
                  >
                    {school.name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {app
                      ? (STAGE_LABELS[app.stage] ?? app.stage)
                      : "On college list · application not started"}
                    {(app?.round ?? school.round) &&
                      ` · ${ROUND_FULL_LABELS[(app?.round ?? school.round)!] ?? app?.round ?? school.round}`}
                  </p>
                </div>
                <Link
                  href={collegeWorkspacePath(
                    school.id,
                    data.student.id,
                    data.surface,
                  )}
                  className={link}
                >
                  Open college workspace
                </Link>
              </div>
              <p className="text-sm">
                <span className="font-medium">Deadline:</span>{" "}
                {school.deadline
                  ? formatCalendarDate(school.deadline)
                  : "Not recorded"}
              </p>
              {deadlineAttention(
                school.deadline,
                data.today,
                app?.stage ?? null,
              ) && (
                <p className="rounded-lg bg-warning-50 p-3 text-sm font-medium text-warning-800">
                  {deadlineAttention(
                    school.deadline,
                    data.today,
                    app?.stage ?? null,
                  )}
                </p>
              )}
              {(school.coverage == null ||
                school.coverage === "needs_review") && (
                <p className="rounded-lg bg-warning-50 p-3 text-sm text-warning-800">
                  Requirements need verification. Check the official application
                  with your counselor.
                </p>
              )}
              {school.coverage === "no_supplement" && (
                <p className="text-sm text-gray-600">
                  No general supplement is listed; program-specific responses
                  may still apply.
                </p>
              )}
              {!family &&
                school.coverage === "verified" &&
                unassigned.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm">
                      Required responses to assign ({unassigned.length})
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {unassigned.map((row) => (
                        <li key={row.id}>{row.title}</li>
                      ))}
                    </ul>
                    <Link
                      href={boardUrl}
                      className={`${link} mt-2 inline-block`}
                    >
                      Review requirements
                    </Link>
                  </div>
                )}
              {app && (
                <div>
                  <h3 className="font-semibold text-sm">
                    Application checklist
                  </h3>
                  {app.checklist ? (
                    <>
                      {missing.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                          {missing.map((item) => (
                            <li key={item.key}>{item.label}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-gray-600">
                          All recorded checklist items are complete.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-600">
                      Checklist not yet recorded.
                    </p>
                  )}
                </div>
              )}
              <div>
                <h3 className="font-semibold text-sm">
                  {family ? "Shared essays" : "Essays"}
                </h3>
                {visibleEssays.length ? (
                  <ul className="mt-2 space-y-2 text-sm">
                    {visibleEssays.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap justify-between gap-2"
                      >
                        <Link
                          className={link}
                          href={`${data.surface === "staff" ? "/essays" : family ? "/family-essays" : "/student-essays"}/${row.essay!.id}`}
                        >
                          {row.title}
                        </Link>
                        <span className="text-gray-600">
                          {(family || data.surface === "student"
                            ? ESSAY_STATUS_PORTAL_LABELS
                            : ESSAY_STATUS_LABELS)[row.essay!.status] ??
                            row.essay!.status}
                          {row.planningNeedsReview && !row.requirementsChanged
                            ? " · Planning needs review"
                            : ""}
                          {row.requirementsChanged
                            ? " · Requirements changed"
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">
                    {family
                      ? "No essays have been shared with you for this college."
                      : "No essays assigned for this college yet."}
                  </p>
                )}
                {!family && incomplete.length > 0 && (
                  <p className="mt-2 text-xs text-gray-600">
                    {incomplete.length} assigned{" "}
                    {incomplete.length === 1 ? "essay is" : "essays are"} not
                    yet approved or final.
                  </p>
                )}
              </div>
              {tasks.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm">Open linked tasks</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {tasks.map((task) => (
                      <li key={task.id}>
                        <Link
                          href={taskPath(task.id, data.surface)}
                          className={link}
                        >
                          {task.title}
                        </Link>
                        <span className="text-gray-600">
                          {" "}
                          · {TASK_STATUS_LABELS[task.status] ??
                            task.status} ·{" "}
                          {task.isMine
                            ? "Assigned to you"
                            : taskOwnerRoleLabel(task.ownerRole)}
                          {task.dueOn || task.dueAt
                            ? ` · Due ${task.dueOn ? formatCalendarDate(task.dueOn) : formatDate(task.dueAt!)}`
                            : ""}
                          {task.ownerPending ? " · Awaiting owner" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Link href={boardUrl} className={link}>
                Open essay planning
              </Link>
            </section>
          );
        })}
      </div>
      {generalEssays.length > 0 && (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">General and unlinked essays</h2>
          <p className="text-sm text-gray-600">Essays that are not linked to a particular college or application.</p>
          <ul className="space-y-2">
            {generalEssays.map((row) => (
              <li key={row.id}>
                <Link className={link} href={`${data.surface === "staff" ? "/essays" : family ? "/family-essays" : "/student-essays"}/${row.essay!.id}`}>
                  {row.title}
                </Link>
                <span className="text-sm text-gray-600"> · {(family || data.surface === "student" ? ESSAY_STATUS_PORTAL_LABELS : ESSAY_STATUS_LABELS)[row.essay!.status] ?? row.essay!.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {unlinkedCards.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Other applications</h2>
          {unlinkedCards.map(({ app, essays, tasks }) => (
            <article
              key={app.id}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-5"
            >
              <h3 className="font-semibold">{app.collegeName}</h3>
              <p className="text-sm text-gray-600">
                {STAGE_LABELS[app.stage] ?? app.stage} ·{" "}
                {app.deadline
                  ? `Due ${formatCalendarDate(app.deadline)}`
                  : "Deadline not recorded"}
              </p>
              {deadlineAttention(app.deadline, data.today, app.stage) && (
                <p className="rounded-lg bg-warning-50 p-3 text-sm font-medium text-warning-800">
                  {deadlineAttention(app.deadline, data.today, app.stage)}
                </p>
              )}
              <p className="text-sm text-warning-800">
                This application is not linked to a college-list entry, so its
                prompt requirements need review.
              </p>
              <p className="text-sm">
                {app.checklist
                  ? `${app.checklist.filter((item) => !item.done).length} recorded checklist items remain.`
                  : "Checklist not yet recorded."}
              </p>
              {essays.length > 0 && (
                <ul className="space-y-2">
                  {essays.map((row) => (
                    <li key={row.id}>
                      <Link
                        className={link}
                        href={`${data.surface === "staff" ? "/essays" : family ? "/family-essays" : "/student-essays"}/${row.essay!.id}`}
                      >
                        {row.title}
                      </Link>
                      <span className="text-sm text-gray-600">
                        {" "}
                        ·{" "}
                        {(family || data.surface === "student"
                          ? ESSAY_STATUS_PORTAL_LABELS
                          : ESSAY_STATUS_LABELS)[row.essay!.status] ??
                          row.essay!.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {tasks.length > 0 && (
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={taskPath(task.id, data.surface)}
                        className={link}
                      >
                        {task.title}
                      </Link>
                      <span className="text-sm text-gray-600">
                        {" "}
                        · {TASK_STATUS_LABELS[task.status] ??
                          task.status} ·{" "}
                        {task.isMine
                          ? "Assigned to you"
                          : taskOwnerRoleLabel(task.ownerRole)}
                        {task.dueOn || task.dueAt
                          ? ` · Due ${task.dueOn ? formatCalendarDate(task.dueOn) : formatDate(task.dueAt!)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={
                  data.surface === "staff"
                    ? `/applications/${app.id}`
                    : family
                      ? "/family-applications"
                      : "/student-applications"
                }
                className={link}
              >
                Open application
              </Link>
            </article>
          ))}
        </section>
      )}
      {otherTasks.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">
            Other linked application and essay tasks
          </h2>
          <ul className="mt-3 space-y-2">
            {otherTasks.map((t) => (
              <li key={t.id}>
                <Link href={taskPath(t.id, data.surface)} className={link}>
                  {t.title}
                </Link>
                <span className="text-sm text-gray-600">
                  {" "}
                  · {TASK_STATUS_LABELS[t.status] ?? t.status} ·{" "}
                  {t.isMine
                    ? "Assigned to you"
                    : taskOwnerRoleLabel(t.ownerRole)}
                  {t.dueOn || t.dueAt
                    ? ` · Due ${t.dueOn ? formatCalendarDate(t.dueOn) : formatDate(t.dueAt!)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

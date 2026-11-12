import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { EmbeddedShell } from "@/components/layout/embedded-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplicationChecklistSummary } from "@/components/tasks/application-checklist-summary";
import { CollegeWorkspaceAction } from "./workspace-actions";
import type { CollegeWorkspaceData } from "@/lib/colleges/workspace";
import { PROMPT_COVERAGE_LABELS } from "@/lib/colleges/workspace";
import { ROUND_FULL_LABELS, STAGE_LABELS } from "@/lib/constants/applications";
import { ESSAY_STATUS_BADGES, ESSAY_STATUS_LABELS, ESSAY_STATUS_PORTAL_LABELS } from "@/lib/constants/essays";
import { ENGAGEMENT_TYPE_LABELS, INTERVIEW_STATUS_LABELS, parseEngagementLog } from "@/lib/constants/engagement";
import { TASK_STATUS_LABELS, taskOwnerRoleLabel } from "@/lib/constants/tasks";
import { taskPath } from "@/lib/constants/task-links";
import { formatCalendarDate, formatDate } from "@/lib/utils";

const linkClass = "text-sm font-medium text-primary-700 underline underline-offset-2";

export function CollegeWorkspace({ data }: { data: CollegeWorkspaceData }) {
  const { student, college, list, application, promptSet, essays, tasks, surface, canManage } = data;
  const staff = surface === "staff";
  const parent = surface === "family";
  const listPath = staff ? `/students/${student.id}/colleges` : `/${surface}-colleges`;
  const visits = parseEngagementLog(list.engagement_log_json);
  const ready = essays.filter(e => ["approved", "final"].includes(e.status)).length;
  const essayHref = (id: string) => `${staff ? "/essays" : parent ? "/family-essays" : "/student-essays"}/${id}`;
  const essayStatus = (status: string) => (staff ? ESSAY_STATUS_LABELS : ESSAY_STATUS_PORTAL_LABELS)[status] ?? status;

  const Shell = staff ? EmbeddedShell : PageShell;
  const SectionHeading = staff ? "h3" : "h2";
  return <Shell title={college.name}
    description={`${student.first_name} ${student.last_name} · Fall ${student.graduation_year} entry · ${[college.city, college.state_region].filter(Boolean).join(", ")}`}
    actions={<div className="flex w-full flex-wrap items-center justify-between gap-3">{staff && <div><h2 className="text-xl font-semibold text-gray-900">{college.name}</h2><p className="mt-1 text-sm text-gray-500">Fall {student.graduation_year} entry</p></div>}<Link href={listPath} className={linkClass}>Back to college list</Link></div>}>
    <div className="space-y-6" data-testid="college-workspace">
      <nav aria-label="College workspace sections" className="flex flex-wrap gap-x-5 gap-y-2">
        {[["application", "Application"], ["writing", "Writing requirements"], ["essays", parent ? "Shared essays" : "Essays"], ["tasks", "Tasks"], ["visits", "Visits & interviews"]].map(([id, label]) =>
          <a key={id} href={`#${id}`} className={linkClass}>{label}</a>)}
      </nav>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><SectionHeading id="application" className="font-semibold">Application</SectionHeading></CardHeader><CardContent>
          {application ? <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2"><Badge>{STAGE_LABELS[application.stage] ?? application.stage}</Badge>
              <span className="text-sm">{ROUND_FULL_LABELS[application.application_type] ?? application.application_type}</span></div>
            <p className="text-sm">Deadline: {application.deadline_at ? formatCalendarDate(application.deadline_at) : "Not set"}
              {application.deadline_at && <span className="ml-2 text-gray-500">{application.deadline_source === "estimate" ? "Estimated — confirm with the school" : "Counselor-entered"}</span>}</p>
            {application.decision_result && <p className="text-sm capitalize">Decision: {application.decision_result}</p>}
            <ApplicationChecklistSummary value={application.checklist_json} headingLevel={staff ? 4 : 3} />
            {staff && <Link href={`/applications/${application.id}`} className={linkClass}>Manage application & checklist</Link>}
          </div> : <div className="space-y-3">
            <p className="text-sm text-gray-600">Researching this college. An application has not been started.</p>
            {canManage ? <CollegeWorkspaceAction collegeId={list.id} kind="application" label="Start application" />
              : <p className="text-sm text-gray-500">Your counselor can start the application when you are ready.</p>}
          </div>}
        </CardContent></Card>
        <Card><CardHeader><SectionHeading className="font-semibold">At a glance</SectionHeading></CardHeader><CardContent>
          <dl className="space-y-2 text-sm">
            <div><dt className="inline text-gray-500">College list: </dt><dd className="inline capitalize">{list.category.replace(/_/g, " ")} · {list.status.replace(/_/g, " ")}</dd></div>
            {list.intended_major && <div><dt className="inline text-gray-500">Intended major: </dt><dd className="inline">{list.intended_major}</dd></div>}
            <div><dt className="inline text-gray-500">{parent ? "Shared essays: " : "Writing: "}</dt><dd className="inline">{parent ? essays.length : `${ready} of ${essays.length} approved or final`}</dd></div>
            <div><dt className="inline text-gray-500">Open tasks: </dt><dd className="inline">{tasks.filter(t => !["completed", "cancelled"].includes(t.status)).length}</dd></div>
          </dl>
          {parent && <p className="mt-3 text-sm text-gray-500">Student-private drafts and counselor-private work are not included. Only essays explicitly shared with family appear here.</p>}
          {college.website_url?.startsWith("https://") && <a href={college.website_url} target="_blank" rel="noreferrer" className={`${linkClass} mt-4 inline-block`}>College website</a>}
        </CardContent></Card>
      </div>

      <Card><CardHeader><SectionHeading id="writing" className="font-semibold">Writing requirements · Fall {student.graduation_year}</SectionHeading></CardHeader><CardContent>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Entry year is based on the student’s graduation year. Review gap-year plans, application route, intended program, honors, and scholarships with the counselor.</p>
          {!promptSet ? <p className="text-sm text-amber-800">No verified library coverage for this college and entry year. This does not mean no essays are required. Check the official application with your counselor.</p> : <>
            <p className="text-sm font-medium">{PROMPT_COVERAGE_LABELS[promptSet.coverage]}</p>
            {promptSet.notes && <p className="text-sm text-gray-600">{promptSet.notes}</p>}
            <p className="text-sm"><a href={promptSet.source_url} target="_blank" rel="noreferrer" className={linkClass}>Official admissions source</a>{promptSet.verified_on && ` · Checked ${promptSet.verified_on}`}</p>
            {promptSet.coverage === "no_supplement" && <p className="text-sm text-gray-600">The general supplement is not required. A personal statement or program-specific materials may still apply.</p>}
            {canManage && promptSet.coverage === "verified" && promptSet.college_library_prompts.some(p => p.requirement === "required") &&
              <CollegeWorkspaceAction collegeId={list.id} kind="required" label="Assign required prompts" />}
            {[...promptSet.college_library_prompts].sort((a, b) => a.sort_order - b.sort_order).map(prompt => {
              const draft = essays.find(e => e.library_prompt_id === prompt.id);
              return <details key={prompt.id} className="rounded-lg border border-gray-200 p-4">
                <summary className="cursor-pointer text-sm font-medium">{prompt.title} · {prompt.requirement}
                  {prompt.word_limit && ` · ${prompt.word_limit} words`}{prompt.character_limit && ` · ${prompt.character_limit} characters`}</summary>
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{prompt.prompt_text}</p>
                <p className="mt-2 text-xs text-gray-500">{prompt.text_kind === "summary" ? "Summary — check the official wording before writing." : "Official prompt wording."}</p>
                {draft ? <div className="mt-3 flex flex-wrap items-center gap-3"><Badge variant={ESSAY_STATUS_BADGES[draft.status] ?? "default"}>{essayStatus(draft.status)}</Badge><Link prefetch={false} href={essayHref(draft.id)} className={linkClass}>{parent ? "Read shared essay" : "Open draft"}</Link></div>
                  : canManage && promptSet.coverage === "verified" ? <div className="mt-3 space-y-2">
                    {prompt.requirement !== "required" && <p className="text-xs text-gray-500">Assign only after reviewing whether this response applies to the student’s route or program.</p>}
                    <CollegeWorkspaceAction collegeId={list.id} kind="prompt" promptId={prompt.id} label={`Assign ${prompt.requirement} response`} />
                  </div> : !parent && <p className="mt-3 text-xs text-gray-500">{promptSet.coverage === "verified" ? "Not assigned. Review with your counselor." : "Awaiting verification; no automatic assignment."}</p>}
              </details>;
            })}
          </>}
        </div>
      </CardContent></Card>

      <Card><CardHeader><SectionHeading id="essays" className="font-semibold">{parent ? "Shared essays" : "Essays"}</SectionHeading></CardHeader><CardContent>
        {essays.length ? <ul className="divide-y divide-gray-100">{essays.map(essay => <li key={essay.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><Link prefetch={false} href={essayHref(essay.id)} className={linkClass}>{essay.title || "Untitled essay"}</Link><p className="mt-1 text-xs text-gray-500">Version {essay.current_version_number} · Updated {formatDate(essay.updated_at)}</p></div>
          <Badge variant={ESSAY_STATUS_BADGES[essay.status] ?? "default"}>{essayStatus(essay.status)}</Badge>
        </li>)}</ul> : <p className="text-sm text-gray-500">{parent ? "No essays have been shared with your family for this college." : "No essays assigned for this college yet. Review the requirements above."}</p>}
        {canManage && <Link href={`/students/${student.id}/essays`} className={`${linkClass} mt-4 inline-block`}>Create or link another essay</Link>}
      </CardContent></Card>

      <Card><CardHeader><SectionHeading id="tasks" className="font-semibold">Tasks</SectionHeading></CardHeader><CardContent>
        <p className="mb-3 text-sm text-gray-500">Work linked to this application, its essays, and its college-specific plans.</p>
        {tasks.length ? <ul className="divide-y divide-gray-100">{tasks.map(task => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><Link href={taskPath(task.id, surface)} className={linkClass}>{task.title}</Link><p className="mt-1 text-xs text-gray-500">{taskOwnerRoleLabel(task.owner_role)}{(task.due_on || task.due_at) && ` · Due ${formatDate((task.due_on || task.due_at)!)}`}</p></div>
          <span className="text-sm text-gray-600">{TASK_STATUS_LABELS[task.status] ?? task.status}</span>
        </li>)}</ul> : <p className="text-sm text-gray-500">No visible tasks linked to this college yet.</p>}
        {staff && <Link href={`/students/${student.id}/tasks`} className={`${linkClass} mt-4 inline-block`}>Manage student tasks</Link>}
      </CardContent></Card>

      <Card><CardHeader><SectionHeading id="visits" className="font-semibold">Visits & interviews</SectionHeading></CardHeader><CardContent>
        {list.interview_status && <p className="mb-3 text-sm">Interview: {INTERVIEW_STATUS_LABELS[list.interview_status] ?? list.interview_status}{list.interview_at && ` · ${formatDate(list.interview_at)}`}</p>}
        {visits.length ? <ul className="space-y-3">{visits.map((visit, i) => <li key={i} className="text-sm">
          {ENGAGEMENT_TYPE_LABELS[visit.type] ?? visit.type}{visit.date && ` · ${formatDate(visit.date)}`}
          {/* The current portal exposes engagement dates/types, not staff notes. */}
          {staff && visit.note && <p className="mt-1 whitespace-pre-wrap text-gray-600">{visit.note}</p>}
        </li>)}</ul> : <p className="text-sm text-gray-500">No visits logged yet.</p>}
        {canManage && <Link href={listPath} className={`${linkClass} mt-4 inline-block`}>Record visits or update the college list</Link>}
      </CardContent></Card>
    </div>
  </Shell>;
}

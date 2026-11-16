import { deadlineAttention } from "./readiness";
import { dateOnly } from "../tasks/due-date";
import { effectivePromptSets, promptSlot } from "../colleges/prompt-review";
import { parseChecklist } from "../constants/applications";
import { taskOwnerRoleLabel } from "../constants/tasks";

export const CASELOAD_FILTERS = [
  ["attention", "Needs attention"], ["all", "All work"], ["overdue", "Overdue"],
  ["soon", "Deadline within 14 days"], ["missing_date", "Missing deadline"],
  ["estimate", "Estimated deadline"], ["review", "Essays awaiting review"],
  ["prompts", "Required responses unassigned"], ["coverage", "Requirements unverified"],
  ["task", "Overdue tasks"], ["follow_through", "Application follow-through"],
] as const;
export type CaseloadIssue = { kind: string; label: string; href: string; priority: number; owner: string };
export type CaseloadFilters = { search?: string; counselor?: string; year?: string; college?: string; attention?: string; page?: string };
type Named = { id: string; name: string };
export type CaseloadSource = {
  students: { id: string; first_name: string; last_name: string; graduation_year: number }[];
  assignments: { student_id: string; user_id: string; name: string; assignment_type: string; is_primary: boolean }[];
  colleges: { id: string; student_id: string; college_id: string; name: string; scorecard_id: number | null }[];
  applications: { id: string; student_id: string; student_college_id: string | null; college_id: string; name: string; deadline_at: string | null; deadline_source: string | null; stage: string; checklist_json: unknown }[];
  essays: { id: string; student_id: string; student_college_id: string | null; application_id: string | null; title: string | null; status: string; library_prompt_id: string | null; library_prompt_slot: string | null }[];
  followThrough?: {id:string;student_id:string;application_id:string;kind:string;status:string;title:string;family_shared:boolean}[];
  tasks: { id: string; student_id: string | null; title: string; status: string; application_id: string | null; related_entity_type: string | null; related_entity_id: string | null; workflow_step_id: string | null; due_on: string | null; due_at: string | null; owner_role: string | null; owner_pending: boolean; ownerName: string | null }[];
  workflows: { student_id: string; student_college_id: string | null; student_workflow_steps: { id: string }[] }[];
  sets: { id: string; firm_id: string | null; scorecard_id: number; entry_year: number; coverage: string; review_state: string; college_library_prompts: { id: string; prompt_key: string; requirement: string }[] }[];
};
export type CaseloadRow = {
  id: string; studentId: string; student: string; year: number; college: string; collegeId: string | null;
  counselors: { id: string; name: string }[]; deadline: string | null; estimated: boolean;
  stage: string | null; issues: CaseloadIssue[]; readinessHref: string; workspaceHref: string;
};
const closed = (stage: string | null) => ["submitted", "under_review", "decision_received", "withdrawn"].includes(stage ?? "");
export function taskIsOverdue(task: { due_on: string | null; due_at: string | null }, today: string, now: number) {
  if (task.due_on) return dateOnly.safeParse(task.due_on).success && task.due_on < today;
  return !!task.due_at && Date.parse(task.due_at) < now;
}

/** Counts use metadata only: essay bodies, interview answers and strategy notes are never needed. */
export function caseloadRows(source: CaseloadSource, today: string, now: number): CaseloadRow[] {
  const sets = effectivePromptSets(source.sets);
  const rows: CaseloadRow[] = [];
  for (const student of source.students) {
    const sid = student.id, readinessHref = `/students/${sid}/readiness`;
    const assignments = source.assignments.filter(a => a.student_id === sid);
    const counselors = assignments.filter(a => a.assignment_type === "counselor").map(a => ({ id: a.user_id, name: a.name }));
    const colleges = source.colleges.filter(c => c.student_id === sid);
    const apps = source.applications.filter(a => a.student_id === sid);
    const essays = source.essays.filter(e => e.student_id === sid);
    const workflows = source.workflows.filter(w => w.student_id === sid);
    const tasks = source.tasks.filter(t => t.student_id === sid);
    const groups = [
      ...colleges.map(c => ({ key: c.id, collegeId: c.college_id, name: c.name, listId: c.id, scorecard: c.scorecard_id, app: apps.find(a => a.student_college_id === c.id) })),
      ...apps.filter(a => !colleges.some(c => c.id === a.student_college_id)).map(a => ({ key: a.id, collegeId: a.college_id, name: a.name, listId: null, scorecard: null, app: a })),
    ];
    const usedEssays = new Set<string>(), usedTasks = new Set<string>();
    const add = (key: string, college: string, collegeId: string | null, listId: string | null, app: typeof apps[number] | undefined, groupEssays: typeof essays, groupTasks: typeof tasks, issues: CaseloadIssue[]) => {
      const workspaceHref = listId ? `/students/${sid}/colleges/${listId}` : app ? `/applications/${app.id}` : `/students/${sid}/essays`;
      for (const essay of groupEssays) if (essay.status === "in_review") issues.push({ kind: "review", label: `Review essay: ${essay.title || "Untitled essay"}`, href: `/essays/${essay.id}`, priority: 3, owner: "Counseling team" });
      for (const task of groupTasks) if (taskIsOverdue(task, today, now) || task.owner_pending) issues.push({kind: task.owner_pending ? "owner" : "task", label: `${task.owner_pending ? "Resolve owner" : "Follow up"}: ${task.title}`, href: `/tasks/${task.id}`, priority: task.owner_pending ? 3 : 0, owner: task.owner_pending ? "Owner unresolved" : task.ownerName || taskOwnerRoleLabel(task.owner_role)});
      issues.sort((a,b) => a.priority-b.priority || a.label.localeCompare(b.label));
      rows.push({id:`${sid}:${key}`,studentId:sid,student:`${student.first_name} ${student.last_name}`,year:student.graduation_year,college,collegeId,counselors,deadline:app?.deadline_at??null,estimated:app?.deadline_source==="estimate",stage:app?.stage??null,issues,readinessHref,workspaceHref});
    };
    for (const group of groups) {
      const {app,listId}=group, workspace = listId ? `/students/${sid}/colleges/${listId}` : `/applications/${app!.id}`;
      const planning = `/students/${sid}/essays/planning${listId ? `?college=${listId}` : ""}`;
      const groupEssays = essays.filter(e => (listId && e.student_college_id === listId) || (app && e.application_id === app.id));
      const ids = new Set(groupEssays.map(e => e.id)); groupEssays.forEach(e => usedEssays.add(e.id));
      const steps = new Set(workflows.filter(w => listId && w.student_college_id === listId).flatMap(w => w.student_workflow_steps.map(s => s.id)));
      const groupTasks = tasks.filter(t => (app && (t.application_id === app.id || (t.related_entity_type === "application" && t.related_entity_id === app.id))) || (t.related_entity_type === "essay" && ids.has(t.related_entity_id ?? "")) || steps.has(t.workflow_step_id ?? ""));
      groupTasks.forEach(t => usedTasks.add(t.id));
      const issues: CaseloadIssue[] = [];
      const issue = (kind:string,label:string,href:string,priority:number) => issues.push({kind,label,href,priority,owner:"Counseling team"});
      if (app && ["submitted","under_review"].includes(app.stage)) {
        const tracking=(source.followThrough??[]).filter(i=>i.application_id===app.id);
        const href=`/applications/${app.id}/follow-through`;
        if(!tracking.some(i=>i.kind==="receipt" && i.status==="received")) issue("follow_through","Confirm application acknowledgment",href,3);
        if(!tracking.some(i=>i.kind==="portal" && i.status==="active")) issue("follow_through","Check applicant portal access",href,4);
        for(const item of tracking.filter(i=>i.kind==="material" && !["received","waived"].includes(i.status))) issue("follow_through",`Confirm material: ${item.title}`,`${href}#tracking-${item.id}`,3);
      }
      if (!closed(app?.stage??null)) {
        const deadline = app?.deadline_at;
        const attention = deadlineAttention(deadline??null,today,app?.stage??null);
        if (attention) issue(attention==="Past due"?"overdue":"soon",attention==="Past due"?"Review overdue application":"Review approaching deadline",workspace,attention==="Past due"?0:1);
        if (!deadline || !dateOnly.safeParse(deadline.slice(0,10)).success) issue("missing_date","Confirm application deadline",workspace,2);
        else if(app?.deadline_source==="estimate") issue("estimate","Verify estimated deadline",workspace,2);
        const set = sets.find(s => s.scorecard_id===group.scorecard && s.entry_year===student.graduation_year);
        if(!set || set.coverage==="needs_review") issue("coverage","Verify prompt requirements",planning,4);
        if(set?.coverage==="verified") {
          const missing = set.college_library_prompts.filter(p => p.requirement==="required" && !groupEssays.some(e => e.library_prompt_id===p.id || e.library_prompt_slot===promptSlot(set.scorecard_id,set.entry_year,p.prompt_key)));
          if(missing.length) issue("prompts",`Assign ${missing.length} required ${missing.length===1?"response":"responses"}`,planning,4);
        }
        if(!app) issue("application","Start application",workspace,5);
        else { const checklist=parseChecklist(app.checklist_json); const remaining=checklist?.filter(c=>!c.done).length; if(checklist===null || remaining) issue("checklist",checklist===null?"Review missing checklist":`Review ${remaining} incomplete checklist items`,`/applications/${app.id}`,5); }
      }
      add(group.key,group.name,group.collegeId,listId,app,groupEssays,groupTasks,issues);
    }
    const generalEssays=essays.filter(e=>!usedEssays.has(e.id));
    const generalIds=new Set(generalEssays.map(e=>e.id));
    const generalTasks=tasks.filter(t=>!usedTasks.has(t.id) && (t.application_id || t.workflow_step_id || t.related_entity_type==="application" || (t.related_entity_type==="essay"&&generalIds.has(t.related_entity_id??""))));
    if(!groups.length || generalEssays.length || generalTasks.length) add("general","General work",null,null,undefined,generalEssays,generalTasks,!groups.length?[{kind:"college_list",label:"Review college list",href:`/students/${sid}/colleges`,priority:5,owner:"Counseling team"}]:[]);
  }
  return rows.sort((a,b)=>(a.issues[0]?.priority??99)-(b.issues[0]?.priority??99) || (a.deadline??"9999").localeCompare(b.deadline??"9999") || a.student.localeCompare(b.student) || a.id.localeCompare(b.id));
}

export function filterCaseload(rows:CaseloadRow[], source:CaseloadSource, filters:CaseloadFilters) {
  const attention=CASELOAD_FILTERS.some(([key])=>key===filters.attention)?filters.attention!:"attention";
  const filtered=rows.filter(r=>(!filters.search || r.student.toLocaleLowerCase().includes(filters.search.trim().toLocaleLowerCase())) &&
    (!filters.year || String(r.year)===filters.year) && (!filters.college || r.collegeId===filters.college) &&
    (!filters.counselor || source.assignments.some(a=>a.student_id===r.studentId&&a.user_id===filters.counselor&&a.assignment_type==="counselor")) &&
    (attention==="all" || (attention==="attention" ? r.issues.length>0 : attention==="overdue" ? r.issues.some(i=>["overdue","task"].includes(i.kind)) : r.issues.some(i=>i.kind===attention))));
  const size=25,total=filtered.length,pages=Math.max(1,Math.ceil(total/size));
  const page=Math.min(pages,Math.max(1,Number.isSafeInteger(Number(filters.page))?Number(filters.page):1));
  const distinct=(items:Named[])=>[...new Map(items.map(i=>[i.id,i])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  return {rows:filtered.slice((page-1)*size,page*size),total,students:new Set(filtered.map(r=>r.studentId)).size,page,pages,attention,
    counselors:distinct(source.assignments.filter(a=>a.assignment_type==="counselor").map(a=>({id:a.user_id,name:a.name}))),
    colleges:distinct(rows.flatMap(r=>r.collegeId?[{id:r.collegeId,name:r.college}]:[])),years:[...new Set(source.students.map(s=>s.graduation_year))].sort((a,b)=>a-b)};
}

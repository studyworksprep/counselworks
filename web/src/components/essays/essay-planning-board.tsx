"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modals/modal";
import { ActionForm, Hidden } from "@/components/interview/action-form";
import { CollegeWorkspaceAction } from "@/components/colleges/workspace-actions";
import { saveEssayPlan } from "@/lib/actions/essay-planning";
import { PLAN_APPROACHES, PLAN_APPROACH_LABELS, essayPlanningPath, materialConfirmed, planningSignals, type EssayPlanningBoardData, type PlanningRow } from "@/lib/essays/planning";
import { familyVisibleEntries } from "@/lib/interview/template";
import { collegeWorkspacePath } from "@/lib/colleges/workspace";
import { ESSAY_STATUS_BADGES, ESSAY_STATUS_LABELS, ESSAY_STATUS_PORTAL_LABELS } from "@/lib/constants/essays";
import { ROUND_FULL_LABELS } from "@/lib/constants/applications";
import { formatCalendarDate, formatDate } from "@/lib/utils";

const linkClass = "text-sm font-medium text-primary-700 underline underline-offset-2";
function bankPath(data: EssayPlanningBoardData) {
  return data.surface === "staff" ? `/students/${data.student.id}/interview` : data.surface === "student" ? "/student-interview" : `/family-interview/${data.student.id}`;
}
function essayPath(data: EssayPlanningBoardData, id: string) { return `${data.surface === "staff" ? "/essays" : data.surface === "family" ? "/family-essays" : "/student-essays"}/${id}`; }

function PlanEditor({ data, row, onClose }: { data: EssayPlanningBoardData; row: PlanningRow; onClose: () => void }) {
  const id = useId(), [selected, setSelected] = useState(row.entryIds), [review, setReview] = useState(row.plan?.review_state ?? "draft");
  const [dirty, setDirty] = useState(false), [closeAttempt, setCloseAttempt] = useState(false), [saving, setSaving] = useState(false);
  const student = data.surface === "student", shared = new Set(familyVisibleEntries(data.entries).map(e => e.id));
  const familyReady = ["family", "firm"].includes(row.essay!.visibility_scope) && selected.every(entry => shared.has(entry));
  function close() { if (saving) return; if (dirty) setCloseAttempt(true); else onClose(); }
  return <Modal open trapFocus onClose={close} title={`Plan: ${row.title}`} description="Give this response a distinct purpose and connect the material that supports it." size="lg" footer={<>
    {closeAttempt && <><p role="status" className="mr-auto text-sm text-warning-800">Your edits have not been saved.</p><Button variant="danger" disabled={saving} onClick={onClose}>Discard edits</Button></>}
    <Button variant="outline" disabled={saving} onClick={close}>Cancel</Button>
  </>}>
    <ActionForm action={saveEssayPlan} label="Save plan" onDirty={setDirty} onPendingChange={setSaving} onSaved={onClose}>
      <Hidden name="student_id" value={data.student.id} /><Hidden name="essay_id" value={row.essay!.id} /><Hidden name="revision" value={row.plan?.revision ?? 0} />
      {row.entryIds.map(entry => <Hidden key={entry} name="expected_link" value={entry} />)}
      <Hidden name="source_versions" value={JSON.stringify(data.entries.filter(entry => selected.includes(entry.id)).map(entry => ({ id: entry.id, revision: entry.revision })))} />
      <Select id={`${id}-approach`} label="Response approach" name="approach" defaultValue={row.plan?.approach ?? "exploring"} options={PLAN_APPROACHES.map(value => ({ value, label: PLAN_APPROACH_LABELS[value] }))} />
      <Textarea id={`${id}-angle`} label="What will this response show?" name="angle" rows={5} maxLength={6000} defaultValue={row.plan?.angle ?? ""} placeholder="The specific angle, scene or research detail this response will add. Notes and bullet points are welcome." />
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Stories and narratives to connect</legend>
        <p className="text-xs leading-5 text-gray-600">Choose up to 20. Narrative connections also count their supporting stories when checking overlap. Research or college-fit responses can use an angle without a personal story.</p>
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-gray-200 p-3">
          {data.entries.map(entry => <label key={entry.id} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="entry_id" value={entry.id} checked={selected.includes(entry.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, entry.id] : ids.filter(value => value !== entry.id))} />
            <span className="min-w-0"><span className="block font-medium">{entry.title}</span><span className="mt-1 block text-xs text-gray-500">{entry.kind === "story" ? "Story" : "Narrative"} · {materialConfirmed(entry, data.entries) ? "Student confirmed" : "Needs student review"} · {shared.has(entry.id) ? "Family-shared" : "Student and counseling team"}</span><span className="mt-1 block text-xs leading-5 text-gray-600">{entry.body.slice(0, 180)}{entry.body.length > 180 ? "…" : ""}</span></span>
          </label>)}
          {!data.entries.length && <p className="text-sm text-gray-500">Save a story from the interview or add one in the story bank, then connect it here.</p>}
        </div>
      </fieldset>
      {student ? <>
        <Select id={`${id}-review`} label="Plan review" name="review_state" value={review} onChange={event => setReview(event.target.value as typeof review)} options={[{ value: "draft", label: "Still planning" }, { value: "confirmed", label: "I reviewed this angle and material" }, { value: "revisit", label: "I want to revisit this plan" }]} />
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="family_shared" value="yes" defaultChecked={familyReady && row.plan?.family_shared} disabled={!familyReady || review !== "confirmed"} /><span>Allow my parents or guardians to see this plan note and approach.</span></label>
        {!familyReady && <p className="text-xs text-warning-800">Your counselor must share the essay with family, and every connected story or narrative must be confirmed and family-shared before you can share the plan note.</p>}
      </> : <><Hidden name="review_state" value="draft" /><p className="rounded-lg bg-primary-50 p-3 text-sm">The student and counseling team can see this plan. The student reviews it and chooses parent sharing. Saving a counselor revision asks for a fresh review and pauses parent access to the note.</p></>}
      <p className="text-xs leading-5 text-gray-600">These are the same connections shown in the story bank and essay. Saving keeps their audiences separate. A reviewed plan still needs to go through the essay writing and review process.</p>
    </ActionForm>
  </Modal>;
}

export function EssayPlanningBoard({ data, initialCollege, initialEssay }: { data: EssayPlanningBoardData; initialCollege?: string; initialEssay?: string }) {
  const family = data.surface === "family";
  const [college, setCollege] = useState(data.schools.some(s => s.id === initialCollege) ? initialCollege! : "all");
  const [focusEssay, setFocusEssay] = useState(data.rows.some(r => r.essay?.id === initialEssay) ? initialEssay : undefined);
  const [search, setSearch] = useState(""), [attention, setAttention] = useState("all"), [editor, setEditor] = useState<string | null>(null);
  const report = useMemo(() => planningSignals(data), [data]);
  const editorRow = data.rows.find(r => r.id === editor);
  const assigned = data.rows.filter(r => r.essay), gapRows = data.rows.filter(r => report.signals.get(r.id)!.gaps.length);
  const overlaps = assigned.filter(r => report.signals.get(r.id)!.overlap.length);
  const sharedIds = new Set(familyVisibleEntries(data.entries).map(e => e.id));
  const filtered = data.rows.filter(row => {
    const signal = report.signals.get(row.id)!;
    return (college === "all" || (college === "general" ? row.schoolId == null : row.schoolId === college)) &&
      (!focusEssay || row.essay?.id === focusEssay) && `${row.title} ${row.promptText}`.toLowerCase().includes(search.toLowerCase()) &&
      (attention === "all" || (attention === "gaps" && signal.gaps.length > 0) || (attention === "review" && signal.needsReview) || (attention === "reuse" && signal.overlap.length > 0) || (attention === "reviewed" && signal.reviewed));
  });
  const groups = [...data.schools.map(s => ({ id: s.id, title: s.name, school: s })), { id: "general", title: "General and unlinked essays", school: null }].filter(group =>
    (college === "all" || college === group.id) && (filtered.some(r => (r.schoolId ?? "general") === group.id) || (!focusEssay && !search && attention === "all" && !!group.school)));
  return <div className="space-y-6">
    <nav aria-label="Essay planning connections" className="flex flex-wrap gap-x-5 gap-y-2">
      <Link href={`${bankPath(data)}?view=bank`} className={linkClass}>{family ? "Shared story bank" : "Story and narrative bank"}</Link>
      <Link href={`${bankPath(data)}?view=strategy`} className={linkClass}>Strategy brief</Link>
      {data.surface !== "family" && <Link href={data.surface === "staff" ? `/students/${data.student.id}/essays` : "/student-essays"} className={linkClass}>Essay drafts</Link>}
    </nav>
    <p className="max-w-4xl text-sm leading-6 text-gray-600">{family ? "This is your family's shared view. Gaps, connections and reuse include only essays and material shared with you; a private plan may exist. Students approve parent access to planning notes separately." : "Give every response a clear angle. Required responses, missing material and repeated stories are shown together; research-based responses can use a plan without a personal story. Plan review is separate from essay approval."}</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Planning overview">
      {(family ? [["Visible essays", assigned.length], ["Shared planning notes", assigned.filter(r => r.plan).length], ["Visible essays without shared material", assigned.filter(r => !r.entryIds.length).length], ["Visible overlap within a college", overlaps.length]] :
        [["Responses with planning gaps", gapRows.length], ["Responses needing review", assigned.filter(r => report.signals.get(r.id)!.needsReview).length], ["Overlap within a college", overlaps.length], ["Reviewed plans", assigned.filter(r => report.signals.get(r.id)!.reviewed).length]]).map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs leading-5 text-gray-600">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
    </div>
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
      <Input id="planning-search" label="Find a prompt or essay" value={search} onChange={event => setSearch(event.target.value)} />
      <Select id="planning-college" label="College or application" value={college} onChange={event => { setCollege(event.target.value); setFocusEssay(undefined); }} options={[{ value: "all", label: "All colleges and general essays" }, ...data.schools.map(s => ({ value: s.id, label: s.name })), { value: "general", label: "General and unlinked essays" }]} />
      <Select id="planning-attention" label="Show" value={attention} onChange={event => setAttention(event.target.value)} options={[{ value: "all", label: "All visible responses" }, ...(!family ? [{ value: "gaps", label: "Planning gaps" }, { value: "review", label: "Needs review" }] : []), { value: "reuse", label: "Same-college story overlap" }, { value: "reviewed", label: "Reviewed plans" }]} />
      {(focusEssay || search || college !== "all" || attention !== "all") && <div className="sm:col-span-3"><Button size="sm" variant="ghost" onClick={() => { setCollege("all"); setFocusEssay(undefined); setSearch(""); setAttention("all"); }}>Clear filters</Button></div>}
    </div>
    {!data.schools.length && !data.rows.length && <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">{family ? "No college requirements or shared essays are available yet." : "Add colleges or assign a general essay to start the board. Your interview and story bank are available before application season."}</p>}
    {!!data.rows.length && !filtered.length && <p className="text-sm text-gray-500">No visible responses match these filters.</p>}
    {groups.map(group => <section key={group.id} aria-labelledby={`planning-school-${group.id}`} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id={`planning-school-${group.id}`} className="text-xl font-semibold">{group.title}</h2>{group.school && <p className="mt-1 text-xs text-gray-500">{group.school.applicationId ? "Application started" : "On the college list"}{group.school.round && ` · ${ROUND_FULL_LABELS[group.school.round] ?? group.school.round}`}{group.school.deadline && ` · Due ${formatCalendarDate(group.school.deadline)}`}</p>}</div>
        {group.school && <Link href={collegeWorkspacePath(group.id, data.student.id, data.surface)} className={linkClass}>College workspace</Link>}</div>
      {group.school && <>
        {group.school.notes && <p className="text-sm leading-6 text-gray-600">{group.school.notes}</p>}
        {(group.school.coverage == null || group.school.coverage === "needs_review") && <p className="rounded-lg bg-warning-50 p-4 text-sm text-warning-800">Requirements need verification for Fall {data.student.graduationYear}. Missing library coverage does not mean no essays are required. Review the official application with your counselor.</p>}
        {group.school.coverage === "no_supplement" && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">No general supplement is listed. Personal statements and program-specific responses may still apply.</p>}
        {group.school.sourceUrl?.startsWith("https://") && <p className="text-xs text-gray-500"><a href={group.school.sourceUrl} target="_blank" rel="noreferrer" className="text-primary-700 underline">Official requirements source</a>{group.school.checkedOn && ` · Checked ${group.school.checkedOn}`}</p>}
      </>}
      {filtered.filter(row => (row.schoolId ?? "general") === group.id).map(row => {
        const signal = report.signals.get(row.id)!;
        const overLimit = !!row.essay && ((row.wordLimit != null && row.essay.wordCount > row.wordLimit) || (row.characterLimit != null && row.essay.characterCount > row.characterLimit));
        return <article key={row.id} id={row.essay ? `planning-${row.essay.id}` : undefined} aria-label={row.title} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs capitalize text-gray-500">{row.requirement === "custom" ? "Assigned essay" : `${row.requirement} response`}</p><h3 className="mt-1 break-words font-semibold">{row.title}</h3></div><div className="flex flex-wrap items-center gap-2">
            {row.essay && <Badge variant={ESSAY_STATUS_BADGES[row.essay.status] ?? "default"}>{(data.surface === "staff" ? ESSAY_STATUS_LABELS : ESSAY_STATUS_PORTAL_LABELS)[row.essay.status] ?? row.essay.status}</Badge>}
            {row.essay && data.canEdit && <Button size="sm" variant="outline" onClick={() => setEditor(row.id)}>{row.plan || row.entryIds.length ? "Edit plan" : "Plan response"}</Button>}
          </div></div>
          <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">{row.essay ? "Assigned prompt and limits" : "Prompt and limits"}</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{row.promptText || "No prompt text has been added. Review the assignment with your counselor."}</p><p className="mt-2 text-xs text-gray-500">{row.wordLimit ? `${row.wordLimit} words` : "Word limit not recorded"}{row.characterLimit ? ` · ${row.characterLimit} characters` : ""}{row.textKind === "summary" ? " · Summary — confirm official wording" : ""}</p>
            {row.sourceUrl?.startsWith("https://") && <a href={row.sourceUrl} target="_blank" rel="noreferrer" className={`${linkClass} mt-2 inline-block`}>Assigned requirements source</a>}
            {row.currentPrompt && <div className="mt-3 rounded-lg bg-warning-50 p-3 text-sm"><p className="font-medium">Current published requirement</p><p className="mt-2 whitespace-pre-wrap">{row.currentPrompt.text}</p><p className="mt-2 text-xs">{row.currentPrompt.wordLimit ? `${row.currentPrompt.wordLimit} words` : ""}{row.currentPrompt.characterLimit ? ` · ${row.currentPrompt.characterLimit} characters` : ""}</p></div>}
          </details>
          {row.essay ? <>
            <div className="mt-4 flex flex-wrap gap-2">{signal.gaps.map(gap => <Badge key={gap} variant="warning">{gap}</Badge>)}{signal.needsReview && <Badge variant="warning">Needs review</Badge>}{signal.reviewed && <Badge variant="success">Plan reviewed</Badge>}</div>
            {row.requirementsChanged && <p className="mt-3 text-sm text-warning-800">The current requirements differ from this assignment. Review both versions above; the essay keeps its assigned prompt and limits.</p>}
            {signal.sourcesChanged && <p className="mt-3 text-sm text-warning-800">Connected material changed. Review and save the plan again; parent access to the note is paused.</p>}
            {signal.materialReview && <p className="mt-3 text-sm text-warning-800">A connected story or narrative still needs student review in the bank.</p>}
            {signal.overlap.length > 0 && <p className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-800">Story overlap in this college: {signal.overlap.map(id => data.entries.find(e => e.id === id)?.title).join(", ")}. Check that each response adds a different scene, detail or perspective.</p>}
            <div className="mt-4"><h4 className="text-sm font-medium">{family ? "Shared plan note" : "Response angle"}</h4>{row.plan ? <><p className="mt-1 text-xs text-gray-500">{PLAN_APPROACH_LABELS[row.plan.approach]} · {row.plan.review_state === "confirmed" ? "Student reviewed" : row.plan.review_state === "revisit" ? "Student wants to revisit" : "Awaiting student review"} · Saved {formatDate(row.plan.updated_at)}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{row.plan.angle || "No angle recorded yet."}</p>{!family && <p className="mt-2 text-xs text-gray-500">{row.plan.family_shared && row.plan.review_state === "confirmed" && !signal.sourcesChanged && row.entryIds.every(id => sharedIds.has(id)) && ["family","firm"].includes(row.essay.visibility_scope) ? "Plan note shared with parents" : "Plan note: student and counseling team"}</p>}</> : <p className="mt-2 text-sm text-gray-500">{family ? "No planning note has been shared with family." : "Add an angle that distinguishes this response."}</p>}</div>
            <div className="mt-4"><h4 className="text-sm font-medium">{family ? "Shared stories and narratives" : "Connected stories and narratives"}</h4>{row.entryIds.length ? <ul className="mt-2 space-y-2">{row.entryIds.map(id => { const entry = data.entries.find(e => e.id === id)!; return <li key={id} className="flex flex-wrap items-center gap-2 text-sm"><Link href={`${bankPath(data)}?view=bank#interview-bank-${id}`} className={linkClass}>{entry.title}</Link><span className="text-xs text-gray-500">{entry.kind} · {materialConfirmed(entry, data.entries) ? "Student confirmed" : "Needs review"}</span></li>; })}</ul> : <p className="mt-2 text-sm text-gray-500">{family ? "No family-shared material is connected to this essay." : row.plan?.approach === "research" ? "A personal story is optional for this research-based response." : "No story or narrative connected yet."}</p>}</div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3"><Link href={essayPath(data,row.essay.id)} className={linkClass}>{family ? "Read shared essay" : "Open essay"}</Link><p className="text-xs text-gray-500">{row.essay.wordCount}{row.wordLimit ? ` / ${row.wordLimit}` : ""} words{row.characterLimit ? ` · ${row.essay.characterCount} / ${row.characterLimit} characters` : ""} · v{row.essay.current_version_number}{overLimit ? " · Over assigned limit" : ""}</p></div>
          </> : <div className="mt-4 space-y-3">{family ? <p className="text-sm text-gray-500">No essay for this response is currently shared with family.</p> : <p className="text-sm text-gray-600">{row.requirement === "required" ? data.surface === "staff" ? "Required response not assigned." : "This required response is not assigned to you yet. Review it with your counselor." : "Optional or conditional — decide with your counselor whether this response applies."}</p>}
            {data.canAssign && row.schoolId && row.promptId && group.school?.coverage !== "needs_review" && <CollegeWorkspaceAction collegeId={row.schoolId} kind="prompt" promptId={row.promptId} label={`Assign ${row.requirement} response`} />}
          </div>}
        </article>;
      })}
    </section>)}
    <section aria-labelledby="planning-material-heading" className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 id="planning-material-heading" className="text-lg font-semibold">{family ? "Shared material and visible reuse" : "Material bank and reuse"}</h2><p className="mt-2 text-sm leading-6 text-gray-600">Counts include each visible essay once. A story connected directly and through a narrative counts once for overlap. Reusing a theme across colleges can be useful; check repeated stories within one college for repetition.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.entries.map(entry => {
        const uses = entry.kind === "story" ? report.storyUse.get(entry.id) ?? [] : data.rows.filter(row => report.usage.get(entry.id)?.has(row.id));
        return <details key={entry.id} className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-medium">{entry.title}<span className="ml-2 text-xs font-normal text-gray-500">{entry.kind} · {uses.length} visible {uses.length === 1 ? "essay" : "essays"}</span></summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{entry.body}</p>{entry.tags.length > 0 && <p className="mt-2 text-xs text-gray-500">{entry.tags.join(" · ")}</p>}<Link href={`${bankPath(data)}?view=bank#interview-bank-${entry.id}`} className={`${linkClass} mt-3 inline-block`}>Open in story bank</Link><ul className="mt-3 space-y-2">{uses.map(row => <li key={row.id}><Link className={linkClass} href={essayPath(data,row.essay!.id)}>{data.schools.find(s => s.id === row.schoolId)?.name ?? "General essay"} · {row.title}</Link></li>)}</ul></details>;
      })}</div>
      {!data.entries.length && <p className="mt-4 text-sm text-gray-500">{family ? "No stories or narratives are currently shared with family." : "Your saved stories and narratives will appear here, including experiences not connected to any essay yet."}</p>}
    </section>
    {editorRow?.essay && <PlanEditor data={data} row={editorRow} onClose={() => setEditor(null)} />}
    <p className="text-xs text-gray-500">Board: {data.student.name} · Fall {data.student.graduationYear}. <Link className="underline" href={essayPlanningPath(data.student.id,data.surface)}>Reset board view</Link></p>
  </div>;
}

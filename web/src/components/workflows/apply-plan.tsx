"use client";
import { TASK_PRIORITY_OPTIONS, TASK_VISIBILITY_OPTIONS, taskOwnerRoleLabel } from "@/lib/constants/tasks";

import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { planEditSchema } from "@/lib/workflows/plan";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewWorkflowApplication, applyWorkflowToStudent } from "@/lib/actions/workflows";
import type { PlanPreview, PlanEdit } from "@/lib/workflows/plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";

type Choice = {id:string;name:string};
export function PlanPreviewFields({preview,edits,onChange}:{preview:PlanPreview;edits:Record<string,PlanEdit>;onChange:(edits:Record<string,PlanEdit>)=>void}) {
  const prefix=useId();
  const timezone=new Intl.DateTimeFormat("en-US",{timeZone:preview.timezone,timeZoneName:"longGeneric"}).formatToParts(new Date()).find(part=>part.type==="timeZoneName")?.value ?? preview.timezone;
  return <div className="space-y-4">
    <p className="text-sm">Calendar dates use {timezone}. Work is due at the end of the displayed day.</p>
    {preview.existingId && <p className="text-sm text-amber-700">This plan already exists. Applying again opens the existing plan; edits here apply only to a new copy.</p>}
    {preview.steps.map(step=>{const s=step.snapshot_json;const e=edits[step.template_step_id] ?? {};
      const change=(patch:PlanEdit)=>onChange({...edits,[step.template_step_id]:{...e,...patch}});
      const selected=Object.hasOwn(e,"owner") ? e.owner : s.owner;
      const ready=selected ? preview.owners.find(o=>o.id===selected)?.ready : false;
      const due=Object.hasOwn(e,"due") ? e.due : step.due_date;
      const owner=preview.owners.find(o=>o.id===selected);
      const invalid=planEditSchema.safeParse(e);
      return <details key={step.template_step_id} className="rounded-lg border border-gray-200 p-3">
        <summary className="cursor-pointer rounded text-sm focus-visible:outline-2 focus-visible:outline-primary-600">
          <span className="font-semibold break-words">{e.title?.trim() || s.title}</span>
          <span className="mt-1 block text-gray-600">{owner?.name || `Unassigned — ${taskOwnerRoleLabel(s.ownerRole)}`} · {TASK_VISIBILITY_OPTIONS.find(o=>o.value===s.visibility)?.label ?? 'Restricted visibility'} · {due ? `Due ${formatDate(due)}` : 'No due date'}</span>
          {!ready && <span className="mt-1 block text-amber-700">Owner unresolved or invitation needed. Link an eligible owner before this work can be completed.</span>}
          {!invalid.success && <span className="mt-1 block text-red-700">Check this step: {invalid.error.issues.map(issue=>issue.message).join('. ')}</span>}
          {s.estimate && !Object.hasOwn(e,'due') && <span className="mt-1 block text-amber-700">Estimated or unverified deadline — confirm with the college.</span>}
          {due && due < preview.today && <span className="mt-1 block text-red-700">This date is already overdue.</span>}
          <span className="mt-1 block text-xs text-primary-700">Expand or collapse step details</span>
        </summary>
        <fieldset className="mt-3 space-y-3">
        <legend className="sr-only">Edit {s.title}</legend>
        <Input id={`${prefix}-${step.template_step_id}-title`} label="Title" value={e.title ?? s.title} onChange={ev=>change({title:ev.target.value})} required />
        <label className="block text-sm">Instructions<textarea className="mt-1 w-full rounded border p-2" value={e.description === undefined ? s.description ?? '' : e.description ?? ''} onChange={ev=>change({description:ev.target.value})}/></label>
        <Select id={`${prefix}-${step.template_step_id}-owner`} label="Owner" value={selected ?? ''} options={[{value:'',label:`Unassigned — ${taskOwnerRoleLabel(s.ownerRole)}`},...preview.owners.filter(o=>o.id!=='student').map(o=>({value:o.id,label:`${o.name} (${taskOwnerRoleLabel(o.role)})${o.ready?'':' — invitation needed'}`}))]} onChange={ev=>change({owner:ev.target.value || null})}/>
        <Select id={`${prefix}-${step.template_step_id}-priority`} label="Priority" value={e.priority ?? s.priority} options={TASK_PRIORITY_OPTIONS.map(p=>({...p}))} onChange={ev=>change({priority:ev.target.value as PlanEdit['priority']})}/>
        <Input id={`${prefix}-${step.template_step_id}-due`} label="Due date" type="date" value={due ?? ''} onChange={ev=>change({due:ev.target.value || null})}/>
        <p className="text-xs text-gray-600">{s.dependency ? `After: ${edits[s.dependency]?.title || preview.steps.find(p=>p.template_step_id===s.dependency)?.snapshot_json.title || 'prerequisite'}.` : 'No prerequisite.'} {Object.hasOwn(e,'due') ? 'Date chosen for this student.' : ({start:'Date calculated from the plan start.',application:'Date calculated from the application deadline.',manual:'Date chosen in the template.',estimate:'Estimated date; confirm before assigning.',legacy:'Date carried over from the original plan.'})[s.dueSource]}</p>
        </fieldset>
      </details>;
    })}
  </div>;
}

/** All assignment entry points share preview, editable instances, and save validation. */
export function ApplyPlan({students,templates,studentId,studentIds,studentCollegeId,onDone,onCancel}:{students?:Choice[];templates:Choice[];studentId?:string;studentIds?:string[];studentCollegeId?:string;onDone?:()=>void;onCancel?:()=>void}) {
  const prefix=useId();
  const router=useRouter();const [pending,start]=useTransition();const [error,setError]=useState<string>();
  const [previews,setPreviews]=useState<{studentId:string;preview:PlanPreview;form:FormData}[]>([]);
  const [edits,setEdits]=useState<Record<string,Record<string,PlanEdit>>>({});const [repeat,setRepeat]=useState<Record<string,string>>({});
  const [saved,setSaved]=useState<{studentId:string;id:string;name:string;reused:boolean}[]>([]);
  const stageRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{stageRef.current?.focus();},[previews,saved]);
  function cancel(){setPreviews([]);setEdits({});setRepeat({});setError(undefined);onCancel?.();}
  function preview(e:React.FormEvent<HTMLFormElement>) {e.preventDefault();const form=new FormData(e.currentTarget);
    start(async()=>{setError(undefined);const results:typeof previews=[];
      for(const id of studentIds ?? [studentId ?? String(form.get('student_id'))]) {
        const f=new FormData();form.forEach((v,k)=>f.set(k,v));f.set('student_id',id);if(studentCollegeId) f.set('student_college_id',studentCollegeId);
        const result=await previewWorkflowApplication(f);if(result.error || !result.preview){setError(result.error);return;}results.push({studentId:id,preview:result.preview,form:f});
      }
      setEdits({});setRepeat({});setPreviews(results);
    });
  }
  function apply(){
    if(previews.some(row=>Object.values(edits[row.studentId] ?? {}).some(edit=>!planEditSchema.safeParse(edit).success))){setError("Check the highlighted steps before applying this plan.");return;}
    start(async()=>{setError(undefined);
    const results:typeof saved=[];
    try {
    for(const row of previews){const f=row.form;f.set('fingerprint',row.preview.fingerprint);f.set('edits',JSON.stringify(edits[row.studentId] ?? {}));
      if(repeat[row.studentId]) f.set('repeat_key',repeat[row.studentId]);else f.delete('repeat_key');
      const result=await applyWorkflowToStudent(f);
      if("reused" in result && result.reused && !row.preview.existingId && Object.keys(edits[row.studentId] ?? {}).length){setError("A plan was assigned while you were previewing. Its settings were preserved. Preview again to open it or intentionally create another copy.");return;}
      if(result.error){setError(`${row.preview.studentName || 'Plan'}: ${result.error}. Earlier saved plans are safe to retry.`);return;}
      if("id" in result && result.id) results.push({studentId:row.studentId,id:result.id,name:row.preview.studentName,reused:!!result.reused});
    }
    setSaved(results);setPreviews([]);router.refresh();
    } catch {setError("The plan could not be confirmed. Your edits are still here; retrying is safe.");}
  });}
  if(saved.length) return <div ref={stageRef} tabIndex={-1} className="space-y-4">
    <Alert variant="success">Plans are ready. Existing copies were reused unless you requested another copy.</Alert>
    <ul className="space-y-3">{saved.map(row=><li key={row.studentId} className="break-words"><p>{row.name} — {row.reused ? 'Existing plan opened' : 'Plan assigned'}</p><Link className="text-primary-700 underline" href={`/students/${row.studentId}#plan-${row.id}`}>View student&apos;s plan<span className="sr-only"> for {row.name}</span></Link></li>)}</ul>
    <Button variant="outline" onClick={()=>{setSaved([]);onDone?.();}}>Done</Button>
  </div>;
  return <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
    {error && <Alert>{error}</Alert>}
    {previews.length===0 ? <form onSubmit={preview} className="space-y-3">
      {!studentId && !studentIds && <Select id={`${prefix}-student`} name="student_id" label="Student" required placeholder="Choose a student" options={(students ?? []).map(s=>({value:s.id,label:s.name}))}/>}
      <Select id={`${prefix}-template`} name="template_id" label="Plan" required placeholder="Choose a plan" options={templates.map(t=>({value:t.id,label:t.name}))} defaultValue={templates.length===1 ? templates[0].id : undefined}/>
      <Input id={`${prefix}-start`} name="start_date" label="Start date (optional)" type="date"/>
      <p className="text-xs text-gray-600">Leave blank to use today, or the application deadline minus 45 days for a college plan.</p>
      <Input id={`${prefix}-name`} name="name" label="Plan name (optional)"/>
      <Button type="submit" loading={pending}>Preview plan</Button>
    </form> : <div ref={stageRef} tabIndex={-1} aria-label="Plan preview" className="flex max-h-[calc(100dvh-13rem)] min-h-0 flex-col gap-3">
      <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-1">
      {previews.map(row=><section key={row.studentId} className="space-y-3">
        <h3 className="font-semibold">{row.preview.studentName} — {row.preview.name}</h3>
        <PlanPreviewFields preview={row.preview} edits={edits[row.studentId] ?? {}} onChange={value=>setEdits({...edits,[row.studentId]:value})}/>
        {row.preview.existingId && <label className="block text-sm"><input type="checkbox" checked={!!repeat[row.studentId]} onChange={e=>setRepeat({...repeat,[row.studentId]:e.target.checked ? crypto.randomUUID() : ''})}/> Intentionally create another copy of this plan</label>}
      </section>)}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 border-t bg-white pt-3"><Button onClick={apply} loading={pending}>Apply plan</Button><Button variant="outline" disabled={pending} onClick={()=>{setPreviews([]);setError(undefined);}}>Back to selection</Button><Button variant="ghost" onClick={cancel}>Cancel</Button></div>
    </div>}
  </fieldset>;
}

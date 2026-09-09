"use client";
import { TASK_PRIORITY_OPTIONS } from "@/lib/constants/tasks";

import { useId, useState, useTransition } from "react";
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
  return <div className="space-y-4">
    <p className="text-sm">Calendar dates use {preview.timezone}. Work is due at the end of the displayed day.</p>
    {preview.existingId && <p className="text-sm text-amber-700">This plan already exists. Applying again opens the existing plan; edits here apply only to a new copy.</p>}
    {preview.steps.map(step=>{const s=step.snapshot_json;const e=edits[step.template_step_id] ?? {};
      const change=(patch:PlanEdit)=>onChange({...edits,[step.template_step_id]:{...e,...patch}});
      const selected=Object.hasOwn(e,"owner") ? e.owner : s.owner;
      const ready=selected ? preview.owners.find(o=>o.id===selected)?.ready : false;
      const due=Object.hasOwn(e,"due") ? e.due : step.due_date;
      return <fieldset key={step.template_step_id} className="space-y-2 rounded border p-3">
        <legend className="px-1 text-sm font-medium">{s.title}</legend>
        <Input id={`${prefix}-${step.template_step_id}-title`} label="Title" value={e.title ?? s.title} onChange={ev=>change({title:ev.target.value})} required />
        <label className="block text-sm">Instructions<textarea className="mt-1 w-full rounded border p-2" value={e.description === undefined ? s.description ?? '' : e.description ?? ''} onChange={ev=>change({description:ev.target.value})}/></label>
        <Select id={`${prefix}-${step.template_step_id}-owner`} label="Owner" value={selected ?? ''} options={[{value:'',label:`Unresolved (${s.ownerRole})`},...preview.owners.filter(o=>o.id!=='student').map(o=>({value:o.id,label:`${o.name} (${o.role})${o.ready?'':' — invitation needed'}`}))]} onChange={ev=>change({owner:ev.target.value || null})}/>
        {!ready && <p className="text-sm text-amber-700">Owner unresolved or invitation needed. This work cannot be completed until an eligible owner is linked.</p>}
        <Select id={`${prefix}-${step.template_step_id}-priority`} label="Priority" value={e.priority ?? s.priority} options={TASK_PRIORITY_OPTIONS.map(p=>({...p}))} onChange={ev=>change({priority:ev.target.value as PlanEdit['priority']})}/>
        <Input id={`${prefix}-${step.template_step_id}-due`} label="Due date" type="date" value={due ?? ''} onChange={ev=>change({due:ev.target.value || null})}/>
        <p className="text-xs text-gray-600">Visible to: {s.visibility}. {s.dependency ? `After: ${preview.steps.find(p=>p.template_step_id===s.dependency)?.snapshot_json.title ?? 'prerequisite'}.` : 'No prerequisite.'} Date: {Object.hasOwn(e,'due') ? 'manual override' : s.dueSource}.</p>
        {s.estimate && !Object.hasOwn(e,'due') && <p className="text-sm text-amber-700">Estimated or unverified deadline — confirm with the college.</p>}
        {due && due < preview.today && <p className="text-sm text-red-700">This date is already overdue.</p>}
      </fieldset>;
    })}
  </div>;
}

/** All assignment entry points share preview, editable instances, and save validation. */
export function ApplyPlan({students,templates,studentId,studentIds,studentCollegeId,onDone}:{students?:Choice[];templates:Choice[];studentId?:string;studentIds?:string[];studentCollegeId?:string;onDone?:()=>void}) {
  const prefix=useId();
  const router=useRouter();const [pending,start]=useTransition();const [error,setError]=useState<string>();
  const [previews,setPreviews]=useState<{studentId:string;preview:PlanPreview;form:FormData}[]>([]);
  const [edits,setEdits]=useState<Record<string,Record<string,PlanEdit>>>({});const [repeat,setRepeat]=useState<Record<string,string>>({});
  function preview(e:React.FormEvent<HTMLFormElement>) {e.preventDefault();const form=new FormData(e.currentTarget);
    start(async()=>{setError(undefined);const results:typeof previews=[];
      for(const id of studentIds ?? [studentId ?? String(form.get('student_id'))]) {
        const f=new FormData();form.forEach((v,k)=>f.set(k,v));f.set('student_id',id);if(studentCollegeId) f.set('student_college_id',studentCollegeId);
        const result=await previewWorkflowApplication(f);if(result.error || !result.preview){setError(result.error);return;}results.push({studentId:id,preview:result.preview,form:f});
      }
      setEdits({});setRepeat({});setPreviews(results);
    });
  }
  function apply(){start(async()=>{setError(undefined);
    for(const row of previews){const f=row.form;f.set('fingerprint',row.preview.fingerprint);f.set('edits',JSON.stringify(edits[row.studentId] ?? {}));
      if(repeat[row.studentId]) f.set('repeat_key',repeat[row.studentId]);else f.delete('repeat_key');
      const result=await applyWorkflowToStudent(f);
      if("reused" in result && result.reused && !row.preview.existingId && Object.keys(edits[row.studentId] ?? {}).length){setError("A plan was assigned while you were previewing. Its settings were preserved. Preview again to open it or intentionally create another copy.");return;}
      if(result.error){setError(`${row.preview.studentName || 'Plan'}: ${result.error}. Earlier saved plans are safe to retry.`);return;}
    }
    setPreviews([]);router.refresh();onDone?.();
  });}
  return <fieldset disabled={pending} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    {previews.length===0 ? <form onSubmit={preview} className="space-y-3">
      {!studentId && !studentIds && <Select id={`${prefix}-student`} name="student_id" label="Student" required placeholder="Choose a student" options={(students ?? []).map(s=>({value:s.id,label:s.name}))}/>}
      <Select id={`${prefix}-template`} name="template_id" label="Plan" required placeholder="Choose a plan" options={templates.map(t=>({value:t.id,label:t.name}))} defaultValue={templates.length===1 ? templates[0].id : undefined}/>
      <Input id={`${prefix}-start`} name="start_date" label="Start date (optional)" type="date"/>
      <p className="text-xs text-gray-600">Leave blank to use today, or the application deadline minus 45 days for a college plan.</p>
      <Input id={`${prefix}-name`} name="name" label="Plan name (optional)"/>
      <Button type="submit" loading={pending}>Preview plan</Button>
    </form> : <>
      {previews.map(row=><section key={row.studentId} className="space-y-3">
        <h3 className="font-semibold">{row.preview.studentName} — {row.preview.name}</h3>
        <PlanPreviewFields preview={row.preview} edits={edits[row.studentId] ?? {}} onChange={value=>setEdits({...edits,[row.studentId]:value})}/>
        {row.preview.existingId && <label className="block text-sm"><input type="checkbox" checked={!!repeat[row.studentId]} onChange={e=>setRepeat({...repeat,[row.studentId]:e.target.checked ? crypto.randomUUID() : ''})}/> Intentionally create another copy of this plan</label>}
      </section>)}
      <div className="flex gap-3"><Button onClick={apply} loading={pending}>Apply plan</Button><Button variant="outline" disabled={pending} onClick={()=>setPreviews([])}>Back to selection</Button></div>
    </>}
  </fieldset>;
}

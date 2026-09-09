"use client";
import { TASK_PRIORITY_OPTIONS } from "@/lib/constants/tasks";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {getPlanStepEdit,savePlanStepEdit,preservePlanSettings} from "@/lib/actions/workflows";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import {Modal} from "@/components/modals/modal";
import type {PlanEdit} from "@/lib/workflows/plan";

export function EditPlanStep({id}:{id:string}) {
  const router=useRouter();const [loaded,setLoaded]=useState<Awaited<ReturnType<typeof getPlanStepEdit>>>();
  const [open,setOpen]=useState(false);const [error,setError]=useState<string>();const [pending,start]=useTransition();
  return <><Button size="sm" variant="outline" onClick={()=>{setError(undefined);setLoaded(undefined);setOpen(true);start(async()=>setLoaded(await getPlanStepEdit(id)));}}>Edit step</Button>
    <Modal open={open} onClose={()=>setOpen(false)} title="Edit this plan step">
      {(error || loaded?.error) && <p role="alert">{error || loaded?.error}</p>}
      {loaded?.step && <form className="space-y-3" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);const step=loaded.step!;
        const edit:PlanEdit={title:String(form.get('title')),description:String(form.get('description')),owner:String(form.get('owner')) || null,priority:String(form.get('priority')) as PlanEdit['priority']};
        const due=String(form.get('due')) || null;if(due!==step.due_date)edit.due=due;
        start(async()=>{const result=await savePlanStepEdit(id,step.updated_at,edit);if(result.error)setError(result.error);else{setOpen(false);router.refresh();}});
      }}>
        <p className="text-sm">Changes affect only this student&apos;s plan and linked task. Changing a date makes it a manual override.</p>
        <Input id={`${id}-title`} name="title" label="Title" defaultValue={loaded.step.snapshot.title} required/>
        <label className="block text-sm">Instructions<textarea name="description" className="w-full rounded border p-2" defaultValue={loaded.step.snapshot.description ?? ''}/></label>
        <Select id={`${id}-owner`} name="owner" label="Owner" defaultValue={loaded.step.snapshot.owner ?? ''} options={[{value:'',label:'Unresolved'},...(loaded.step.snapshot.owner && !loaded.owners?.some(o=>o.id===loaded.step?.snapshot.owner) ? [{value:loaded.step.snapshot.owner,label:'Previous owner — choose a replacement'}] : []),...(loaded.owners ?? []).filter(o=>o.id!=='student').map(o=>({value:o.id,label:`${o.name}${o.ready?'':' — invitation needed'}`}))]}/>
        <Select id={`${id}-priority`} name="priority" label="Priority" defaultValue={loaded.step.snapshot.priority} options={TASK_PRIORITY_OPTIONS.map(p=>({...p}))}/>
        <Input id={`${id}-due`} type="date" name="due" label={`Due date (${loaded.step.snapshot.timezone})`} defaultValue={loaded.step.due_date ?? ''}/>
        <p className="text-xs">Current date source: {loaded.step.snapshot.dueSource}{loaded.step.snapshot.estimate ? ' — estimated or unverified' : ''}</p>
        <Button type="submit" loading={pending}>Save step</Button>
      </form>}
    </Modal></>;
}

export function PreservePlanSettings({id}:{id:string}) {
  const router=useRouter();const [error,setError]=useState<string>();const [pending,start]=useTransition();
  return <div className="rounded border p-3 text-sm">
    <p>This older plan still uses template settings. Review the steps shown here, then preserve their current settings to personalize this plan or edit its template. Existing owners, dates, and completion stay as they are; date sources remain unverified.</p>
    {error && <p role="alert">{error}</p>}
    <Button size="sm" variant="outline" loading={pending} onClick={()=>start(async()=>{const result=await preservePlanSettings(id);if(result.error)setError(result.error);else router.refresh();})}>Preserve current plan settings</Button>
  </div>;
}

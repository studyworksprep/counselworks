"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ActionForm, Hidden } from "./action-form";
import { acceptStudentAiSuggestion, dismissStudentAiAssistance, loadStudentAiAssistance, requestStudentAiAssistance } from "@/lib/actions/student-ai";
import { contextKey, contextReference, contextSourceLabel, sourcesForMode, type AssistanceMode, type AssistanceRequest, type StudentAiContext } from "@/lib/ai/student-context";
import { STRATEGY_SECTIONS } from "@/lib/interview/strategy";
import type { InterviewWorkspace } from "@/lib/interview/template";

const MODE_LABELS: Record<AssistanceMode,string> = { questions: "Interview follow-up questions", story: "Possible stories", narrative: "Possible narrative themes", strategy: "Counselor strategy notes" };
type Workspace = { context: StudentAiContext; requests: AssistanceRequest[] };

function SuggestionReview({ request, index, data, recipientId, onSaved, onDirty }: {
  request: AssistanceRequest; index: number; data: InterviewWorkspace; recipientId: string; onSaved: () => void; onDirty: (key: string, dirty: boolean) => void;
}) {
  const item = request.result.items[index], id = useId(), [dirty,setDirty] = useState(false), [reset,setReset] = useState(0);
  // Keep the revision displayed when review opened, even if the page refreshes.
  const [revision] = useState(data.strategySections.find(s => s.section_key === item.sectionKey)?.revision ?? 0);
  const dirtyKey = `ai:${request.id}:${index}`;
  const label = request.mode === "questions" ? "Add counselor follow-up" : request.mode === "strategy" ? (revision ? "Append to counselor draft" : "Save counselor draft") : `Save ${request.mode} draft`;
  return <details className="mt-4 rounded-lg border border-primary-100 p-3"><summary className="cursor-pointer text-sm font-medium">Review before saving</summary>
    <ActionForm key={reset} action={acceptStudentAiSuggestion} label={label} className="mt-4" onSaved={() => { onDirty(dirtyKey,false);setDirty(false);onSaved(); }} onDirty={value => {setDirty(value);onDirty(dirtyKey,value);}}>
      <Hidden name="student_id" value={data.student.id}/><Hidden name="recipient_id" value={recipientId}/><Hidden name="request_id" value={request.id}/><Hidden name="index" value={index}/><Hidden name="section_revision" value={revision}/>
      <Input id={`${id}-title`} label="Suggestion title" name="title" defaultValue={item.title} required maxLength={160}/>
      <Textarea id={`${id}-text`} label={request.mode === "questions" ? "Question to ask" : "Draft to review"} name="body" defaultValue={item.body} rows={5} maxLength={3000} required/>
      <p className="text-xs leading-5 text-gray-600">{request.mode === "questions" ? "The question will appear in Counselor follow-up for this respondent. They decide whether to share their reply." : request.mode === "strategy" ? "Adds these notes to the selected brief section as a counselor-only draft. Existing text is preserved. Student review and parent sharing require fresh approval." : "Starts an unconfirmed draft for the student and counseling team. The student decides whether it is accurate and whether to share it with parents."}</p>
      {dirty && <Button type="button" size="sm" variant="ghost" onClick={() => {setReset(n=>n+1);setDirty(false);onDirty(dirtyKey,false);}}>Discard suggestion edits</Button>}
    </ActionForm>
  </details>;
}

export function InterviewAiAssistance({ data, recipientId, onRecipient, stage, hasUnsaved, onDirty, onQuestion, onView }: {
  data: InterviewWorkspace; recipientId: string; onRecipient: (id: string) => void; stage: number; hasUnsaved: boolean;
  onDirty: (key: string, dirty: boolean) => void; onQuestion: (key: string, prompt: string) => void; onView: (view: "bank" | "strategy") => void;
}) {
  const router = useRouter(), id = useId();
  const [workspace,setWorkspace] = useState<Workspace>(), [mode,setMode] = useState<AssistanceMode>("questions"), [selected,setSelected] = useState<string[]>([]);
  const [interviewStage,setInterviewStage] = useState(stage), [error,setError] = useState(""), [pending,start] = useTransition();
  const recipient = data.respondents.find(r=>r.id===recipientId);
  const allowedModes: AssistanceMode[] = recipient?.kind === "parent" ? ["questions"] : data.canCounsel ? ["questions","story","narrative","strategy"] : ["questions","story","narrative"];
  const available = workspace ? sourcesForMode(workspace.context,mode) : [];
  async function reload() {
    const result = await loadStudentAiAssistance(data.student.id,recipientId);
    if ("error" in result) {setError(result.error);setWorkspace(undefined);} else {setWorkspace(result.data);setSelected([]);}
  }
  function run(task:()=>Promise<void>) {setError("");onDirty("ai-pending",true);start(async()=>{try {await task();} catch {setError("Unable to load assistance. Your work is unchanged.");} finally {onDirty("ai-pending",false);}});}
  function changeMode(value: AssistanceMode) {setMode(value);setSelected([]);}
  const canAct = !hasUnsaved && !pending;
  return <section aria-labelledby="interview-ai-heading" className="space-y-5">
    <div><h2 id="interview-ai-heading" className="text-xl font-semibold">Interview assistance</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Explore a response, notice a possible story, or connect confirmed experiences. AI suggestions can be mistaken. You review every suggestion; nothing is confirmed or shared automatically.</p>
    </div>
    {data.kind === "staff" && <Select id={`${id}-respondent`} label="Interview to support" value={recipientId} disabled={!canAct} onChange={e=>{onRecipient(e.target.value);setWorkspace(undefined);setMode("questions");setSelected([]);}} options={data.respondents.map(r=>({value:r.id,label:`${r.name} — ${r.kind}`}))}/>}
    <div className="rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm leading-6">
      <p>Assistance uses only selected saved material available to {recipient?.kind === "parent" ? "this parent" : "the student"}. Private counselor notes, original story snapshots, skipped responses, and other people’s private answers are excluded.</p>
      <p className="mt-2">Your suggestions are private to your account. Saving a story or follow-up uses its usual sharing rules. Parent assistance never creates a story in the student’s voice.</p>
    </div>
    <Button variant="outline" disabled={!canAct || !recipientId} loading={pending} onClick={()=>run(reload)}>{workspace ? "Refresh context and suggestions" : "Review AI context"}</Button>
    {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
    {workspace && <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select id={`${id}-mode`} label="Help with" value={mode} disabled={!canAct} onChange={e=>changeMode(e.target.value as AssistanceMode)} options={allowedModes.map(value=>({value,label:MODE_LABELS[value]}))}/>
        {mode === "questions" && <Select id={`${id}-stage`} label="Interview stage" value={String(interviewStage)} disabled={!canAct} onChange={e=>setInterviewStage(Number(e.target.value))} options={[{value:"1",label:"1 · Priorities"},{value:"2",label:"2 · Experiences"},{value:"3",label:"3 · Review together"}]}/>}
      </div>
      <fieldset disabled={!canAct} className="min-w-0 rounded-xl border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold">Material to use ({selected.length} selected)</legend>
        <p className="mb-3 text-xs leading-5 text-gray-600">Select up to 20 sources. Only selected text is sent to our AI provider, Anthropic, when you ask for suggestions. Stories must be student-confirmed; brief sections must be shared with and reviewed by the student. Refresh after changing source material.</p>
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {available.map(source=><div key={contextKey(source)} className="rounded-lg bg-gray-50 p-3">
            <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={selected.includes(contextKey(source))} onChange={e=>setSelected(keys=>e.target.checked?[...keys,contextKey(source)]:keys.filter(k=>k!==contextKey(source)))} disabled={!selected.includes(contextKey(source))&&selected.length>=20}/><span className="min-w-0 break-words">{contextSourceLabel(source,workspace.context.recipientKind)}</span></label>
            <details className="ml-6 mt-2 text-xs"><summary className="cursor-pointer text-primary-700">Preview selected source text</summary><p className="mt-2 whitespace-pre-wrap break-words leading-5">{source.text}</p></details>
          </div>)}
          {!available.length && <p className="text-sm text-gray-500">{mode === "questions" ? "You can start with a gentle interview question, or save a response to get a more specific follow-up." : mode === "story" ? "Save a student interview response first." : mode === "narrative" ? "Confirm a story in the bank first." : "Save student responses or confirm stories first."}</p>}
        </div>
      </fieldset>
      <Button disabled={!canAct || (mode!=="questions"&&!selected.length)} loading={pending} onClick={()=>run(async()=>{
        const result=await requestStudentAiAssistance({studentId:data.student.id,recipientId,mode,stage:interviewStage,refs:available.filter(s=>selected.includes(contextKey(s))).map(contextReference)});
        if("error" in result)setError(result.error);else setWorkspace(result.data);
      })}>Ask for suggestions</Button>
      <p className="text-xs text-gray-500">Suggestions stay available for 30 days while their sources and permissions remain current. Source changes require a fresh request.</p>
      {!workspace.requests.length && <p className="text-sm text-gray-500">No current suggestions. Choose material above and ask when you are ready.</p>}
      {workspace.requests.map(request=><div key={request.id} className="space-y-4 rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{MODE_LABELS[request.mode]}</h3><Button size="sm" variant="ghost" disabled={!canAct} onClick={()=>run(async()=>{const result=await dismissStudentAiAssistance(data.student.id,recipientId,request.id);if("error" in result)setError(result.error);else await reload();})}>Dismiss suggestions</Button></div>
        {request.result.items.map((item,index)=><article key={index} aria-label={item.title} className="rounded-lg bg-gray-50 p-4">
          <h4 className="text-sm font-semibold">{item.title}</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p><p className="mt-2 text-xs leading-5 text-gray-600">Why explore this: {item.reason}</p>
          {item.sectionKey && <p className="mt-2 text-xs">Brief section: {STRATEGY_SECTIONS.find(s=>s.key===item.sectionKey)?.title}</p>}
          <ul className="mt-2 list-inside list-disc text-xs text-gray-500">{item.sourceKeys.map(key=><li key={key}>{workspace.context.sources.find(s=>contextKey(s)===key)?.label??"Selected interview material"}</li>)}</ul>
          {request.used_indices.includes(index) ? <p role="status" className="mt-3 text-sm text-success-700">Saved for review — confirmation and sharing are still separate.</p> : request.mode === "questions" && !data.canCounsel ?
            <Button size="sm" variant="outline" className="mt-3" disabled={!canAct} onClick={()=>item.questionKey&&onQuestion(item.questionKey,item.body)}>Explore in my interview</Button> :
            <SuggestionReview request={request} index={index} data={data} recipientId={recipientId} onDirty={onDirty} onSaved={()=>{router.refresh();run(reload);}}/>}
        </article>)}
      </div>)}
      <div className="flex flex-wrap gap-3"><Button size="sm" variant="outline" disabled={!canAct} onClick={()=>onView("bank")}>{data.kind==="parent"?"Open shared story bank":"Open story bank"}</Button><Button size="sm" variant="outline" disabled={!canAct} onClick={()=>onView("strategy")}>Open strategy brief</Button></div>
    </>}
  </section>;
}

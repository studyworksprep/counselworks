"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/modals/modal";
import { ANSWER_LABELS, ANSWER_STATES, PRIORITIES, SECTION_LABELS, STAGES, questionFor, questionsFor, type BankEntry, type InterviewAnswer, type InterviewQuestion, type InterviewWorkspace } from "@/lib/interview/template";
import { createInterviewFollowup, linkStoryToEssay, reviewInterviewStage, saveInterviewAnswer, saveStoryEntry, updateInterviewFollowup } from "@/lib/actions/interview";

type Action=(form:FormData)=>Promise<{error?:string;success?:boolean}>;
function Hidden({name,value}:{name:string;value:string|number}) {return <input type="hidden" name={name} value={value}/>;}
function audienceOptions(parent=false) {return [
 {value:"counselor",label:"You and your counseling team"},
 {value:"family",label:parent?"Student, family and counseling team":"You, your family and counseling team"},
];}
function audienceLabel(audience:string) {return audience==="family"?"Shared with family":"Respondent and counseling team";}
function ActionForm({action,children,label,onSaved,onDirty,className=""}:{action:Action;children:ReactNode;label:string;onSaved?:()=>void;onDirty?:(dirty:boolean)=>void;className?:string}) {
 const [pending,start]=useTransition(),[error,setError]=useState(""),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{if(!dirty)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[dirty]);
 return <form className={`space-y-4 ${className}`} onChange={()=>{setDirty(true);setSaved(false);onDirty?.(true);}} onSubmit={e=>{
  e.preventDefault();const form=new FormData(e.currentTarget);setError("");
  start(async()=>{try {const result=await action(form);if(result.error)setError(result.error);else{setDirty(false);setSaved(true);onDirty?.(false);onSaved?.();}}catch{setError("Unable to save. Your text is still here. Please try again.");}});
 }}>
  <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>
  {error&&<p role="alert" className="text-sm text-danger-700">{error}</p>}
  <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="sm" loading={pending}>{label}</Button>
   <span role="status" className="text-xs text-gray-500">{dirty?"Unsaved changes":saved?"Saved":""}</span></div>
 </form>;
}
function AnswerCard({question,answer,data,onStory,onFollowup,onDirty,hasUnsaved}:{question:InterviewQuestion;answer?:InterviewAnswer;data:InterviewWorkspace;onStory:(a:InterviewAnswer)=>void;onFollowup:(a:InterviewAnswer)=>void;onDirty:(key:string,dirty:boolean)=>void;hasUnsaved:boolean}) {
 const id=useId(),editable=data.kind!=="staff"&&(!answer||answer.respondent_user_id===data.actorId);
 const [revision,setRevision]=useState(answer?.revision??0);
 const initial=answer?.answer??(question.key==="A1"?`${data.student.name}, Class of ${data.student.graduationYear}`:question.key==="A2"?data.student.school??"":"");
 const priorities=initial.split("\n");
 return <details className="rounded-xl border border-gray-200 bg-white p-4" data-question={question.key}>
  <summary className="cursor-pointer text-sm font-medium leading-6 text-gray-900">
   <span className="mr-2 text-xs text-primary-700">{question.key}</span>{question.text}
   <span className="ml-2 whitespace-nowrap text-xs font-normal text-gray-500">{answer?ANSWER_LABELS[answer.state]:"Not answered yet"}</span>
  </summary>
  <div className="mt-4">
   {editable?<ActionForm action={saveInterviewAnswer} label="Save response" onSaved={()=>setRevision(r=>r+1)} onDirty={dirty=>onDirty(question.key,dirty)}>
    <Hidden name="student_id" value={data.student.id}/><Hidden name="question_key" value={question.key}/><Hidden name="revision" value={revision}/>
    {question.key==="P1"?<div className="grid gap-3 sm:grid-cols-3">{[1,2,3].map(rank=><Select key={rank} id={`${id}-rank-${rank}`} label={`Priority ${rank}`} name={`priority_${rank}`} defaultValue={priorities[rank-1]??""} options={[{value:"",label:"Still exploring"},...PRIORITIES.map(p=>({value:p,label:p}))]}/>)}</div>:
     <Textarea id={`${id}-answer`} label="Your response" name="answer" defaultValue={initial} maxLength={12000} rows={5} placeholder="Notes and bullet points are welcome."/>}
    <div className="grid gap-3 sm:grid-cols-2">
     <Select id={`${id}-state`} label="Where you are with this question" name="state" defaultValue={answer?.state??"answered"} options={ANSWER_STATES.map(s=>({value:s,label:ANSWER_LABELS[s]}))}/>
     <Select id={`${id}-audience`} label="Who can see this response" name="audience" defaultValue={answer?.audience??"counselor"} options={audienceOptions(data.kind==="parent")}/>
    </div>
    <p className="text-xs text-gray-500">Sharing is set separately for each response, saved story and essay. You can change it later. Skip or discuss a question whenever you prefer.</p>
   </ActionForm>:<div className="space-y-2 text-sm"><p className="whitespace-pre-wrap text-gray-700">{answer?.answer||"No written response."}</p>{answer&&<p className="text-xs text-gray-500">{ANSWER_LABELS[answer.state]} · {audienceLabel(answer.audience)}</p>}</div>}
   {answer&&<div className="mt-4 flex flex-wrap gap-3">
    {answer.respondent_kind==="student"&&answer.answer.trim()&&answer.state!=="skip"&&(data.kind==="student"||data.canCounsel)&&<Button variant="outline" size="sm" disabled={hasUnsaved} onClick={()=>onStory(answer)}>Save as story</Button>}
    {data.canCounsel&&<Button variant="outline" size="sm" onClick={()=>onFollowup(answer)}>Ask about this response</Button>}
   </div>}
  </div>
 </details>;
}

function BankEditor({data,entry,kind,source,onClose}:{data:InterviewWorkspace;entry?:BankEntry;kind:"story"|"narrative";source?:InterviewAnswer;onClose:()=>void}) {
 const id=useId(),student=data.kind==="student";
 return <Modal open trapFocus onClose={onClose} title={entry?`Edit ${kind}`:`Add ${kind}`} description={kind==="story"?"Capture one experience in the student's voice.":"Explore a possible theme and connect the stories that support it."} size="lg" footer={<Button variant="outline" onClick={onClose}>Cancel</Button>}>
  <ActionForm action={saveStoryEntry} label={entry?"Save changes":`Save ${kind}`} onSaved={onClose}>
   <Hidden name="student_id" value={data.student.id}/><Hidden name="id" value={entry?.id??""}/><Hidden name="kind" value={kind}/><Hidden name="revision" value={entry?.revision??0}/><Hidden name="source_answer_id" value={entry?.source_answer_id??source?.id??""}/>
   <Input id={`${id}-title`} label="Title" name="title" required maxLength={160} defaultValue={entry?.title??(source?`A memory from ${source.question_key}`:"")}/>
   <Textarea id={`${id}-body`} label={kind==="story"?"What happened":"What this theme means"} name="body" required maxLength={12000} rows={6} defaultValue={entry?.body??source?.answer??""}/>
   <Textarea id={`${id}-reflection`} label="Why it matters / what changed" name="reflection" maxLength={6000} defaultValue={entry?.reflection??""}/>
   <Input id={`${id}-tags`} label="Themes or interests (separate with commas)" name="tags" maxLength={490} defaultValue={entry?.tags.join(", ")??""}/>
   {kind==="narrative"&&<fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Supporting stories</legend>
    <p className="text-xs text-gray-500">Confirm at least one supporting story before confirming a narrative. Share every supporting story before sharing the narrative with family.</p>
    {data.entries.filter(e=>e.kind==="story").map(s=><label key={s.id} className="flex items-start gap-2 text-sm"><input type="checkbox" name="story_id" value={s.id} defaultChecked={entry?.story_ids.includes(s.id)??false} className="mt-1"/><span>{s.title} · {s.review_state}</span></label>)}
    {!data.entries.some(e=>e.kind==="story")&&<p className="text-sm text-gray-500">Add a story first, or save this as an early draft.</p>}
   </fieldset>}
   {student?<div className="grid gap-3 sm:grid-cols-2">
    <Select id={`${id}-review`} label="Does this feel accurate?" name="review_state" defaultValue={entry?.review_state??"draft"} options={[{value:"draft",label:"Still a draft"},{value:"confirmed",label:"Yes, this sounds like me"},{value:"revisit",label:"I want to revisit this"}]}/>
    <Select id={`${id}-audience`} label="Who can see this item" name="audience" defaultValue={entry?.audience??"counselor"} options={audienceOptions()}/>
   </div>:<><Hidden name="review_state" value="draft"/><Hidden name="audience" value={entry?.audience??"counselor"}/><p className="rounded-lg bg-primary-50 p-3 text-sm">Saved as a draft for the student to review. The student controls confirmation and family sharing. Editing confirmed material asks the student to review it again.</p></>}
   {(source||entry?.source_excerpt)&&<p className="text-xs text-gray-500">The original response is kept for the student and counseling team. Family sharing includes the story you write here, not that private source text. Later interview edits will not overwrite the saved original.</p>}
  </ActionForm>
 </Modal>;
}

function Followups({data,source,onCloseSource}:{data:InterviewWorkspace;source?:InterviewAnswer;onCloseSource:()=>void}) {
 const id=useId();
 return <section aria-labelledby="interview-followups" className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="interview-followups" className="text-lg font-semibold">Counselor follow-up <span className="text-sm font-normal text-gray-500">({data.followups.filter(f=>f.status!=="closed").length} open)</span></h2></div>
  {data.canCounsel&&<details open={!!source} className="rounded-xl border border-gray-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Ask a follow-up</summary>
   <ActionForm key={source?.id??"general"} action={createInterviewFollowup} label="Add follow-up" className="mt-4" onSaved={onCloseSource}>
    <Hidden name="student_id" value={data.student.id}/><Hidden name="source_answer_id" value={source?.id??""}/>
    {source?<><Hidden name="recipient_id" value={source.respondent_user_id}/><p className="text-sm">About {source.question_key} · {data.respondents.find(r=>r.id===source.respondent_user_id)?.name}</p></>:
     <Select id={`${id}-recipient`} label="Who should respond?" name="recipient_id" required options={data.respondents.map(r=>({value:r.id,label:`${r.name} (${r.kind})`}))}/>}
    <Textarea id={`${id}-question`} label="Follow-up question" name="question" required maxLength={3000} placeholder="What happened next? What did you do? Which detail do you remember?"/>
    <p className="text-xs text-gray-500">Visible to the recipient and counseling team. The recipient chooses whether to share their reply with family.</p>
   </ActionForm>
  </details>}
  {!data.followups.length&&<p className="text-sm text-gray-500">Questions from your counselor and replies will appear here.</p>}
  {data.followups.map(f=><details key={`${f.id}:${f.revision}`} className="rounded-xl border border-gray-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">{f.question}<span className="ml-2 text-xs font-normal text-gray-500">{f.status} · {data.respondents.find(r=>r.id===f.recipient_user_id)?.name??"Respondent"}</span></summary>
   <div className="mt-4 space-y-3">
    <p className="text-xs text-gray-500">{audienceLabel(f.audience)}</p>
    {f.source_answer_id&&data.answers.find(a=>a.id===f.source_answer_id)&&<p className="text-xs text-primary-700">About interview response {data.answers.find(a=>a.id===f.source_answer_id)?.question_key}</p>}
    {f.reply&&<p className="whitespace-pre-wrap text-sm text-gray-700">{f.reply}</p>}
    {f.recipient_user_id===data.actorId&&f.status!=="closed"&&<ActionForm action={updateInterviewFollowup} label={f.reply?"Update reply":"Send reply"}>
     <Hidden name="student_id" value={data.student.id}/><Hidden name="id" value={f.id}/><Hidden name="revision" value={f.revision}/><Hidden name="action" value="reply"/>
     <Textarea id={`${id}-reply-${f.id}`} label="Your reply" name="reply" required maxLength={12000} defaultValue={f.reply}/>
     <Select id={`${id}-share-${f.id}`} label="Who can see this question and reply" name="audience" defaultValue={f.audience} options={audienceOptions(data.kind==="parent")}/>
    </ActionForm>}
    {data.canCounsel&&<ActionForm action={updateInterviewFollowup} label={f.status==="closed"?"Reopen follow-up":"Close follow-up"}>
     <Hidden name="student_id" value={data.student.id}/><Hidden name="id" value={f.id}/><Hidden name="revision" value={f.revision}/><Hidden name="action" value={f.status==="closed"?"reopen":"close"}/>
    </ActionForm>}
   </div>
  </details>)}
 </section>;
}

function StoryBank({data,onEdit}:{data:InterviewWorkspace;onEdit:(kind:"story"|"narrative",entry?:BankEntry)=>void}) {
 const [filter,setFilter]=useState("all"),editable=data.kind==="student"||data.canCounsel;
 return <section aria-labelledby="story-bank-heading" className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="story-bank-heading" className="text-xl font-semibold">Story and narrative bank</h2><p className="mt-1 max-w-3xl text-sm text-gray-600">Stories capture experiences. Narratives connect those experiences into possible themes. Nothing here becomes an essay or changes essay sharing automatically.</p></div>
   {editable&&<div className="flex gap-2"><Button size="sm" onClick={()=>onEdit("story")}>Add story</Button><Button size="sm" variant="outline" onClick={()=>onEdit("narrative")}>Add narrative</Button></div>}
  </div>
  <div className="flex gap-2" role="group" aria-label="Filter story bank">{[["all","All"],["story","Stories"],["narrative","Narratives"]].map(([key,label])=><Button key={key} size="sm" variant={filter===key?"primary":"outline"} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</Button>)}</div>
  {!data.entries.length&&<Card><CardContent><p className="py-5 text-sm text-gray-600">{data.kind==="parent"?"Stories and narratives the student shares with family will appear here.":"Save a meaningful interview response as a story, or add an experience directly. Small, specific moments count."}</p></CardContent></Card>}
  {data.entries.filter(e=>filter==="all"||e.kind===filter).map(entry=><article key={entry.id} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5" aria-label={entry.title}>
   <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-primary-700">{entry.kind}</p><h3 className="mt-1 text-lg font-semibold">{entry.title}</h3><p className="mt-1 text-xs text-gray-500">{entry.review_state==="confirmed"?"Student confirmed":entry.review_state==="revisit"?"Needs another look":"Draft — awaiting student review"} · {entry.audience==="family"?"Family sharing selected":"Student and counseling team"}</p></div>{editable&&<Button size="sm" variant="outline" onClick={()=>onEdit(entry.kind,entry)}>Edit {entry.kind}</Button>}</div>
   <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{entry.body}</p>
   {entry.reflection&&<p className="whitespace-pre-wrap border-l-2 border-primary-200 pl-3 text-sm text-gray-700">{entry.reflection}</p>}
   {!!entry.tags.length&&<p className="text-xs text-gray-500">Themes: {entry.tags.join(" · ")}</p>}
   {entry.audience==="family"&&entry.review_state!=="confirmed"&&<p className="text-sm text-warning-800">Hidden from family until the student confirms this version.</p>}
   {entry.source_excerpt&&<details className="text-sm"><summary className="cursor-pointer text-gray-500">Original response · student and counseling team</summary><p className="mt-2 whitespace-pre-wrap text-gray-600">{entry.source_excerpt}</p></details>}
   {entry.kind==="narrative"&&<div><p className="text-xs font-medium text-gray-500">Supporting stories</p><ul className="mt-1 list-inside list-disc text-sm">{entry.story_ids.map(story=><li key={story}>{data.entries.find(s=>s.id===story)?.title??"Story no longer shared"}</li>)}</ul></div>}
   {entry.kind==="narrative"&&entry.audience==="family"&&entry.story_ids.some(id=>{const s=data.entries.find(s=>s.id===id);return s?.audience!=="family"||s?.review_state!=="confirmed";})&&<p className="text-sm text-warning-800">Hidden from family while a supporting story is not shared and confirmed. Review and share every supporting story to make this narrative visible again.</p>}
   {entry.kind==="story"&&<div className="space-y-3 border-t border-gray-100 pt-3">
    <p className="text-xs font-medium text-gray-500">Used in essays ({data.links.filter(l=>l.entry_id===entry.id).length})</p>
    {data.links.filter(l=>l.entry_id===entry.id).map(link=><div key={link.essay_id} className="flex flex-wrap items-center gap-3 text-sm">
     <Link className="text-primary-700 underline" href={`${data.kind==="student"?"/student-essays":data.kind==="parent"?"/family-essays":"/essays"}/${link.essay_id}`}>{data.essays.find(e=>e.id===link.essay_id)?.title}</Link>
     {editable&&<ActionForm action={linkStoryToEssay} label="Unlink"><Hidden name="student_id" value={data.student.id}/><Hidden name="entry_id" value={entry.id}/><Hidden name="essay_id" value={link.essay_id}/><Hidden name="remove" value="yes"/></ActionForm>}
    </div>)}
    {editable&&(data.essays.some(e=>!data.links.some(l=>l.entry_id===entry.id&&l.essay_id===e.id))?<ActionForm action={linkStoryToEssay} label="Link to essay">
     <Hidden name="student_id" value={data.student.id}/><Hidden name="entry_id" value={entry.id}/>
     <Select id={`essay-${entry.id}`} name="essay_id" label="Essay to connect" required options={data.essays.filter(e=>!data.links.some(l=>l.entry_id===entry.id&&l.essay_id===e.id)).map(e=>({value:e.id,label:e.title}))}/>
     <p className="text-xs text-gray-500">This records reuse without copying writing or changing either audience.</p>
    </ActionForm>:<p className="text-xs text-gray-500">New essay assignments will be available here to connect.</p>)}
   </div>}
  </article>)}
 </section>;
}

export function InterviewWorkspaceClient({data,initialView="interview"}:{data:InterviewWorkspace;initialView?:"interview"|"bank"}) {
 const [view,setView]=useState<"interview"|"bank">(initialView),[stage,setStage]=useState(1),[section,setSection]=useState("B");
 const [respondent,setRespondent]=useState(data.kind==="staff"?data.respondents.find(r=>r.kind==="student")?.id??"":data.actorId);
 const [editor,setEditor]=useState<{kind:"story"|"narrative";entry?:BankEntry;source?:InterviewAnswer}|null>(null);
 const [followupSource,setFollowupSource]=useState<InterviewAnswer>(),[dirtyKeys,setDirtyKeys]=useState<string[]>([]);
 const selectedKind=data.kind==="staff"?(data.respondents.find(r=>r.id===respondent)?.kind??"student"):data.kind;
 const ownAnswers=data.answers.filter(a=>a.respondent_user_id===respondent);
 const allQuestions=questionsFor(selectedKind),stageQuestions=allQuestions.filter(q=>q.stage===stage);
 const sections=[...new Set(stageQuestions.map(q=>q.section))];
 const currentSection=sections.includes(section)?section:sections[0];
 const shownQuestions=stage===2?stageQuestions.filter(q=>q.section===currentSection):stageQuestions;
 const checkpoint=data.checkpoints.find(c=>c.respondent_user_id===respondent&&c.stage===stage);
 const latest=[...ownAnswers.filter(a=>stage===3||questionFor(a.question_key,selectedKind)?.stage===stage).map(a=>a.updated_at),...(stage===3&&selectedKind==="student"?data.entries.map(e=>e.updated_at):[])].sort().at(-1);
 const reviewed=checkpoint&&(!latest||checkpoint.reviewed_at>=latest);
 const dirty=dirtyKeys.length>0;
 const changeDirty=(key:string,changed:boolean)=>setDirtyKeys(keys=>changed?[...new Set([...keys,key])]:keys.filter(k=>k!==key));
 function navigate(next:()=>void){if(dirty)return;next();}
 return <div className="space-y-7">
  <div className="rounded-xl border border-primary-100 bg-primary-50 p-5">
   <p className="text-sm font-medium text-primary-900">{data.kind==="parent"?"Your perspective matters. Your student's voice stays their own.":"You do not need an impressive story or a settled plan."}</p>
   <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-700">Take this one section at a time. “Still exploring,” skipping, and discussing a question are all valid choices. Responses begin with the respondent and counseling team; family sharing is chosen for each item.</p>
   <p className="mt-2 text-xs text-gray-600">Known information: {data.student.name} · {data.student.school??"School not set"} · Class of {data.student.graduationYear}. {data.kind==="student"&&<Link href="/student-profile" className="underline">Update scores, activities and profile details</Link>}</p>
  </div>
  <div className="flex flex-wrap gap-2" role="group" aria-label="Interview workspace views">
   <Button variant={view==="interview"?"primary":"outline"} disabled={dirty} onClick={()=>navigate(()=>setView("interview"))}>Interview</Button>
   <Button variant={view==="bank"?"primary":"outline"} disabled={dirty} onClick={()=>navigate(()=>setView("bank"))}>{data.kind==="parent"?"Shared story bank":"Story and narrative bank"}</Button>
  </div>
  {view==="interview"?<>
   {data.kind==="staff"&&<Select id="interview-respondent" label="Whose interview?" value={respondent} disabled={dirty} onChange={e=>setRespondent(e.target.value)} options={data.respondents.map(r=>({value:r.id,label:`${r.name} — ${r.kind==="student"?"Student interview":"Parent interview"}`}))}/>}
   <nav aria-label="Interview stages" className="grid gap-3 sm:grid-cols-3">{STAGES.map(s=><button key={s.id} type="button" disabled={dirty} aria-current={stage===s.id?"step":undefined} onClick={()=>navigate(()=>setStage(s.id))} className={`rounded-xl border p-4 text-left disabled:opacity-50 ${stage===s.id?"border-primary-500 bg-primary-50":"border-gray-200 bg-white"}`}>
    <span className="text-xs font-medium text-primary-700">Stage {s.id}</span><span className="mt-1 block font-semibold">{s.title}</span><span className="mt-1 block text-xs text-gray-600">{data.checkpoints.some(c=>c.respondent_user_id===respondent&&c.stage===s.id)?"Reviewed before · revisit anytime":s.description}</span>
   </button>)}</nav>
   {dirty&&<p role="status" className="text-sm text-warning-800">Save your changed responses before switching stages or sections.</p>}
   <section className="space-y-4" aria-labelledby="interview-stage-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="interview-stage-title" className="text-xl font-semibold">{STAGES[stage-1].title}</h2><p className="mt-1 text-sm text-gray-500">{ownAnswers.filter(a=>stageQuestions.some(q=>q.key===a.question_key)).length} of {stageQuestions.length} questions visited · All questions are optional</p></div>{checkpoint&&<p className="text-xs text-gray-500">{reviewed?"Reviewed":"Updated since your review"} · {new Date(checkpoint.reviewed_at).toLocaleDateString()}</p>}</div>
    {stage===2&&<Select id="interview-section" label="Explore a section" value={currentSection} disabled={dirty} onChange={e=>setSection(e.target.value)} options={sections.map(s=>({value:s,label:SECTION_LABELS[s]??"Your observations"}))}/>}
    {stage===3&&selectedKind==="student"&&<Card><CardContent><h3 className="mb-3 font-semibold">Your priorities so far</h3><dl className="grid gap-4 sm:grid-cols-2">{[["P1","Top priorities"],["A3","Academic direction"],["I1","What college is for"],["J2","Requirements to plan around"]].map(([key,label])=><div key={key}><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{ownAnswers.find(a=>a.question_key===key)?.answer||"Still exploring"}</dd></div>)}</dl><p className="mt-4 text-xs text-gray-500">These are the student’s saved words. Update the original response to correct them. Stories and possible narratives are reviewed separately in the bank.</p></CardContent></Card>}
    {shownQuestions.map(q=><AnswerCard key={`${respondent}:${q.key}`} question={q} answer={ownAnswers.find(a=>a.question_key===q.key)} data={data} onStory={a=>setEditor({kind:"story",source:a})} onFollowup={a=>setFollowupSource(a)} onDirty={changeDirty} hasUnsaved={dirtyKeys.includes(q.key)}/>)}
    {data.kind!=="staff"&&!dirty&&<ActionForm action={reviewInterviewStage} label={stage===3?"Finish my interview review":"Mark this stage reviewed"}>
     <Hidden name="student_id" value={data.student.id}/><Hidden name="stage" value={stage}/><p className="text-xs text-gray-500">You can return to any response later. Reviewing a stage does not share answers or confirm stories automatically.</p>
    </ActionForm>}
   </section>
   {data.kind!=="staff"&&data.answers.some(a=>a.respondent_user_id!==data.actorId)&&<details className="rounded-xl border border-gray-200 bg-white p-5"><summary className="cursor-pointer font-medium">Interview responses shared with your family</summary><div className="mt-4 space-y-5">{data.answers.filter(a=>a.respondent_user_id!==data.actorId).map(a=><div key={a.id}><p className="text-xs text-gray-500">{data.respondents.find(r=>r.id===a.respondent_user_id)?.name??a.respondent_kind} · {a.question_key}</p><p className="mt-1 text-sm font-medium">{questionFor(a.question_key,a.respondent_kind)?.text}</p><p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{a.answer||ANSWER_LABELS[a.state]}</p></div>)}</div></details>}
  </>:<StoryBank data={data} onEdit={(kind,entry)=>setEditor({kind,entry})}/>}
  <Followups data={data} source={followupSource} onCloseSource={()=>setFollowupSource(undefined)}/>
  {editor&&<BankEditor data={data} entry={editor.entry} source={editor.source} kind={editor.kind} onClose={()=>setEditor(null)}/>}
 </div>;
}

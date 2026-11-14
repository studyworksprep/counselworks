"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { revalidateEssayPlanningBoards } from "../essays/revalidate";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError } from "../auth/authorize";
import { bankConsentIssue, requireInterviewAccess, requireInterviewRecipient } from "../auth/interview";
import { answerSchema, bankSchema, orderedPriorities, questionFor, INTERVIEW_AUDIENCES } from "../interview/template";

type Mode="read"|"bank"|"response"|"counsel";
function value(form:FormData,key:string) { const v=form.get(key);return typeof v==="string"?v:""; }
function refreshInterview(studentId:string) {
 revalidateEssayPlanningBoards();
 for(const path of [`/students/${studentId}/interview`,"/student-interview",`/family-interview/${studentId}`,"/family-interview","/student-profile"])revalidatePath(path);
 revalidatePath("/essays/[id]","page");revalidatePath("/student-essays/[id]","page");revalidatePath("/family-essays/[id]","page");
}
async function actor(studentId:string,mode:Mode) {
 const ctx=await resolveUserAndFirm();if(!ctx)throw new AuthorizationError("Please sign in");
 const db=getDb();await requireInterviewAccess(db,ctx,studentId,mode);return {ctx,db};
}
function failure(error:unknown) {
 if(error instanceof AuthorizationError)return {error:error.message};
 console.error("Interview operation failed",error instanceof Error?error.message:"Database operation");
 return {error:"Unable to save. Reload to check for changes, then try again."};
}
function databaseError(error:{message:string;code?:string}|null,changed=true) {
 if(!error&&!changed)return {error:"This item changed in another window. Reload before saving; your text is still here."};
 if(error){
  const known=["Confirm at least one supporting story first","Share every supporting story before sharing this narrative","Student chooses family sharing","Student confirms revised stories and narratives","Only a student response can become a story"];
  return {error:known.find(m=>error.message.includes(m))??(error.code==="23505"?"This response was saved in another window. Reload before saving again.":"Unable to save. Check access and reload before trying again.")};
 }
 return null;
}

export async function saveInterviewAnswer(form:FormData) {
 const input=answerSchema.safeParse({studentId:value(form,"student_id"),questionKey:value(form,"question_key"),answer:value(form,"answer"),state:value(form,"state"),audience:value(form,"audience"),revision:Number(value(form,"revision"))});
 if(!input.success)return {error:"Check the response and sharing selection."};
 const p=input.data;
 try {
  const {ctx,db}=await actor(p.studentId,"response");
  const kind=ctx.role==="student"?"student":"parent";
  if(!questionFor(p.questionKey,kind))return {error:"Unknown interview question"};
  if(p.questionKey==="P1") {
   const priorities=orderedPriorities([value(form,"priority_1"),value(form,"priority_2"),value(form,"priority_3")]);
   if(priorities===null)return {error:"Choose a different priority for each position."};
   p.answer=priorities;
  }
  if(p.state==="answered"&&!p.answer)return {error:"Add a response, or choose still exploring, skip, or discuss."};
  const row={answer:p.answer,state:p.state,audience:p.audience,revision:p.revision+1};
  const result=p.revision===0?
   await db.from("student_interview_answers").insert({...row,firm_id:ctx.firmId,student_id:p.studentId,respondent_user_id:ctx.dbUserId,respondent_kind:kind,question_key:p.questionKey}).select("id").single():
   await db.from("student_interview_answers").update(row).eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("respondent_user_id",ctx.dbUserId).eq("question_key",p.questionKey).eq("revision",p.revision).select("id").maybeSingle();
  const err=databaseError(result.error,!!result.data);if(err)return err;
  refreshInterview(p.studentId);return {success:true};
 } catch(error){return failure(error);}
}

export async function reviewInterviewStage(form:FormData) {
 const input=z.object({studentId:z.uuid(),stage:z.coerce.number().int().min(1).max(3)}).safeParse({studentId:value(form,"student_id"),stage:value(form,"stage")});
 if(!input.success)return {error:"Unknown interview stage"};
 try {
  const {ctx,db}=await actor(input.data.studentId,"response");
  const result=await db.from("student_interview_checkpoints").upsert({firm_id:ctx.firmId,student_id:input.data.studentId,respondent_user_id:ctx.dbUserId,stage:input.data.stage,reviewed_at:new Date().toISOString()},{onConflict:"firm_id,student_id,respondent_user_id,stage"});
  const err=databaseError(result.error);if(err)return err;
  refreshInterview(input.data.studentId);return {success:true};
 }catch(error){return failure(error);}
}

export async function saveStoryEntry(form:FormData) {
 const input=bankSchema.safeParse({
  studentId:value(form,"student_id"),id:value(form,"id")||undefined,kind:value(form,"kind"),
  title:value(form,"title"),body:value(form,"body"),reflection:value(form,"reflection"),
  tags:value(form,"tags").split(",").map(t=>t.trim()).filter(Boolean),audience:value(form,"audience"),
  reviewState:value(form,"review_state"),sourceAnswerId:value(form,"source_answer_id")||null,
  storyIds:form.getAll("story_id"),revision:Number(value(form,"revision")),
 });
 if(!input.success)return {error:"Add a title and story or narrative. Keep tags short and check your sharing choices."};
 const p=input.data;
 if(new Set(p.storyIds).size!==p.storyIds.length)return {error:"Choose each supporting story once."};
 try {
  const {ctx,db}=await actor(p.studentId,"bank");
  let previous:{audience:string;kind:string}|undefined;
  if(p.id) {
   const old=await db.from("student_story_bank").select("audience,kind").eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("id",p.id).maybeSingle();
   if(old.error||!old.data||old.data.kind!==p.kind)return {error:"Story not found"};
   previous=old.data;
  }
  const consent=bankConsentIssue(ctx.role,p,previous);if(consent)return {error:consent};
  if(!p.id&&p.sourceAnswerId) {
   const source=await db.from("student_interview_answers").select("respondent_kind").eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("id",p.sourceAnswerId).maybeSingle();
   if(source.error||source.data?.respondent_kind!=="student"||p.kind!=="story")return {error:"Only a student response can become a story"};
  }
  if(p.kind==="story"&&p.storyIds.length)return {error:"Choose supporting stories for a narrative, not a story."};
  if(p.kind==="narrative") {
   const evidence=p.storyIds.length?await db.from("student_story_bank").select("id,audience,review_state").eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("kind","story").in("id",p.storyIds):{data:[],error:null};
   if(evidence.error||evidence.data?.length!==p.storyIds.length)return {error:"Supporting stories must belong to this student."};
   if(p.reviewState==="confirmed"&&(!p.storyIds.length||evidence.data.some(s=>s.review_state!=="confirmed")))return {error:"Confirm at least one supporting story first"};
   if(p.audience==="family"&&(!p.storyIds.length||evidence.data.some(s=>s.audience!=="family")))return {error:"Share every supporting story before sharing this narrative"};
  }
  const changes={title:p.title,body:p.body,reflection:p.reflection,tags:p.tags,audience:p.audience,review_state:p.reviewState,story_ids:p.storyIds,revision:p.revision+1};
  const result=p.id?
   await db.from("student_story_bank").update(changes).eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("id",p.id).eq("revision",p.revision).select("id").maybeSingle():
   await db.from("student_story_bank").insert({...changes,firm_id:ctx.firmId,student_id:p.studentId,kind:p.kind,created_by_user_id:ctx.dbUserId,source_answer_id:p.sourceAnswerId}).select("id").single();
  const err=databaseError(result.error,!!result.data);if(err)return err;
  refreshInterview(p.studentId);return {success:true};
 }catch(error){return failure(error);}
}

export async function createInterviewFollowup(form:FormData) {
 const input=z.object({studentId:z.uuid(),recipientId:z.uuid(),question:z.string().trim().min(1).max(3000),sourceId:z.uuid().nullable()}).safeParse({studentId:value(form,"student_id"),recipientId:value(form,"recipient_id"),question:value(form,"question"),sourceId:value(form,"source_answer_id")||null});
 if(!input.success)return {error:"Choose a recipient and add a follow-up question."};
 const p=input.data;
 try {
  const {ctx,db}=await actor(p.studentId,"counsel");
  await requireInterviewRecipient(db,ctx,p.studentId,p.recipientId);
  if(p.sourceId) {
   const source=await db.from("student_interview_answers").select("id").eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("id",p.sourceId).eq("respondent_user_id",p.recipientId).maybeSingle();
   if(source.error||!source.data)return {error:"Choose a response from this recipient."};
  }
  // Deliberate initial audience: recipient + counseling team. Only the recipient may widen it.
  const result=await db.from("student_interview_followups").insert({firm_id:ctx.firmId,student_id:p.studentId,recipient_user_id:p.recipientId,created_by_user_id:ctx.dbUserId,question:p.question,source_answer_id:p.sourceId,audience:"counselor"});
  const err=databaseError(result.error);if(err)return err;
  refreshInterview(p.studentId);return {success:true};
 }catch(error){return failure(error);}
}

export async function updateInterviewFollowup(form:FormData) {
 const input=z.object({studentId:z.uuid(),id:z.uuid(),revision:z.coerce.number().int().positive(),action:z.enum(["reply","close","reopen"])}).safeParse({studentId:value(form,"student_id"),id:value(form,"id"),revision:value(form,"revision"),action:value(form,"action")});
 if(!input.success)return {error:"Invalid follow-up"};
 const p=input.data;
 try {
  const {ctx,db}=await actor(p.studentId,p.action==="reply"?"response":"counsel");
  const patch:Record<string,unknown>={revision:p.revision+1,status:p.action==="reply"?"answered":p.action==="close"?"closed":"open"};
  if(p.action==="reply") {
   const reply=z.string().trim().min(1).max(12000).safeParse(value(form,"reply"));
   const audience=z.enum(INTERVIEW_AUDIENCES).safeParse(value(form,"audience"));
   if(!reply.success||!audience.success)return {error:"Add a reply and choose who can see it."};
   patch.reply=reply.data;patch.audience=audience.data;
  }
  let query=db.from("student_interview_followups").update(patch).eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("id",p.id).eq("revision",p.revision);
  if(p.action==="reply")query=query.eq("recipient_user_id",ctx.dbUserId).neq("status","closed");
  const result=await query.select("id").maybeSingle();
  const err=databaseError(result.error,!!result.data);if(err)return err;
  refreshInterview(p.studentId);return {success:true};
 }catch(error){return failure(error);}
}

export async function linkStoryToEssay(form:FormData) {
 const input=z.object({studentId:z.uuid(),entryId:z.uuid(),essayId:z.uuid(),remove:z.boolean()}).safeParse({studentId:value(form,"student_id"),entryId:value(form,"entry_id"),essayId:value(form,"essay_id"),remove:value(form,"remove")==="yes"});
 if(!input.success)return {error:"Choose a story and essay"};
 const p=input.data;
 try {
  const {ctx,db}=await actor(p.studentId,"bank");
  const [entry,essay]=await Promise.all([
   db.from("student_story_bank").select("id").eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("id",p.entryId).maybeSingle(),
   db.from("essay_drafts").select("id,visibility_scope").eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("id",p.essayId).maybeSingle(),
  ]);
   if(entry.error||essay.error||!entry.data||!essay.data||(ctx.role==="student"&&!["student","family","firm"].includes(essay.data.visibility_scope)))return {error:"Choose accessible material and an essay for this student."};
  const result=p.remove?
   await db.from("student_story_essay_links").delete().eq("firm_id",ctx.firmId).eq("student_id",p.studentId).eq("entry_id",p.entryId).eq("essay_id",p.essayId):
   await db.from("student_story_essay_links").upsert({firm_id:ctx.firmId,student_id:p.studentId,entry_id:p.entryId,essay_id:p.essayId,created_by_user_id:ctx.dbUserId},{onConflict:"entry_id,essay_id",ignoreDuplicates:true});
  const err=databaseError(result.error);if(err)return err;
  refreshInterview(p.studentId);return {success:true};
 }catch(error){return failure(error);}
}

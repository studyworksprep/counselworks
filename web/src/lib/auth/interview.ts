import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, resolveStudentRelationship, type ActorContext } from "./authorize";

export function bankConsentIssue(role:string,input:{audience:string;reviewState:string},previous?:{audience:string}) {
 if(role==="student")return null;
 if((!previous&&input.audience!=="counselor")||(previous&&input.audience!==previous.audience))return "Student chooses family sharing";
 if(input.reviewState!=="draft"&&input.reviewState!=="revisit")return "Student confirms revised stories and narratives";
 return null;
}

export function canCounselInterview(role:string) {
  return ["firm_owner","firm_admin","counselor","essay_coach","tutor"].includes(role);
}
export function interviewBankWriteAllowed(role:string,relationship:string) {
  return (role==="student" && relationship==="own_student") ||
    (canCounselInterview(role) && ["firm_staff","assigned_staff"].includes(relationship));
}
export function interviewResponseWriteAllowed(role:string,relationship:string) {
  return (role==="student" && relationship==="own_student") ||
    (role==="parent_guardian" && relationship==="family_parent");
}
export async function requireInterviewAccess(db:SupabaseClient,ctx:ActorContext,studentId:string,mode:"read"|"bank"|"response"|"counsel"="read") {
  const relationship=await resolveStudentRelationship(db,ctx,studentId);
  const allowed=["firm_staff","assigned_staff","own_student","family_parent"].includes(relationship);
  if(!allowed || (mode==="bank"&&!interviewBankWriteAllowed(ctx.role,relationship)) ||
    (mode==="response"&&!interviewResponseWriteAllowed(ctx.role,relationship)) ||
    (mode==="counsel"&&!(canCounselInterview(ctx.role)&&["firm_staff","assigned_staff"].includes(relationship)))) {
    throw new AuthorizationError("Interview not available");
  }
  return relationship;
}

export async function requireInterviewRecipient(db:SupabaseClient,ctx:ActorContext,studentId:string,recipientId:string) {
 await requireInterviewAccess(db,ctx,studentId,"counsel");
 const student=await db.from("students").select("user_id,family_id").eq("firm_id",ctx.firmId).eq("id",studentId).maybeSingle();
 if(student.error||!student.data)throw new AuthorizationError("Student not found");
 if(student.data.user_id===recipientId)return;
 const [member,role]=await Promise.all([
  db.from("family_members").select("id").eq("firm_id",ctx.firmId).eq("family_id",student.data.family_id).eq("user_id",recipientId).maybeSingle(),
  db.from("firm_memberships").select("role").eq("firm_id",ctx.firmId).eq("user_id",recipientId).eq("status","active").maybeSingle(),
 ]);
 if(!member.data||role.data?.role!=="parent_guardian")throw new AuthorizationError("Choose this student's parent or student account");
}

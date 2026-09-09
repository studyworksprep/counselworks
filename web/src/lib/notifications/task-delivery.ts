import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, taskNoticeEmail } from "../email";
import { appBaseUrl } from "../agreements/links";
import { resolveNotificationPrefs } from "./prefs";
import { isPlaceholderUser } from "../auth/resolve";

export interface TaskNotice {
  id:string;firm_id:string;user_id:string;task_id:string;workflow_id:string|null;kind:string;title:string;body:string|null;
  email_claim:string;email_payload:ReturnType<typeof taskNoticeEmail>|null;
  event_data:{status:string;due_at:string|null;revision?:number};
}
export function taskNoticeStillRelevant(kind:string,status:string,dueAt:string|null,event:TaskNotice['event_data']) {
  if(kind==='task_submitted') return status==='submitted';
  if(kind==='task_changes_requested') return status==='changes_requested';
  if(kind==='task_approved') return status==='completed';
  if(kind==='task_reminder') return ['pending','in_progress','changes_requested','submitted'].includes(status) && dueAt===event.due_at && status===event.status;
  if(kind==='task_deadline_changed') return !['completed','cancelled'].includes(status) && dueAt===event.due_at;
  return !['completed','cancelled'].includes(status);
}

/** The registered periodic job and reminder handler share this durable drain.
 * db is the existing background-job service client; every lookup is tenant-scoped.
 * send is injected only by disposable tests (no production/test-mode bypass).
 */
export async function deliverTaskNotices(db:SupabaseClient,send:typeof sendEmail=sendEmail) {
  const {data,error}=await db.rpc('claim_task_notices',{p_limit:100});
  if(error) throw new Error('Unable to claim task notifications');
  let sent=0,skipped=0,failed=0;
  for(const notice of (data ?? []) as TaskNotice[]) {
    const receipt=(changes:Record<string,unknown>)=>db.from('notifications').update(changes).eq('firm_id',notice.firm_id).eq('id',notice.id).eq('email_claim',notice.email_claim);
    try {
      const [permission,taskResult,memberResult]=await Promise.all([
        db.rpc('task_notice_allowed',{p_task:notice.task_id,p_user:notice.user_id}),
        db.from('tasks').select('id,title,status,due_at,dependency_blocked,needs_attention,notice_revision,assigned_user_id,reviewer_user_id').eq('firm_id',notice.firm_id).eq('id',notice.task_id).single(),
        db.from('firm_memberships').select('role,users!user_id(email,auth_provider_user_id,notification_preferences_json)').eq('firm_id',notice.firm_id).eq('user_id',notice.user_id).eq('status','active').maybeSingle(),
      ]);
      if(permission.error || taskResult.error || memberResult.error) throw new Error('Unable to revalidate task notification');
      const task=taskResult.data,member=memberResult.data;
      const user=member && (Array.isArray(member.users)?member.users[0]:member.users);
      if(!permission.data || !task || !user ||
        notice.user_id !== (notice.kind==='task_submitted' || notice.kind==='task_attention' || (notice.kind==='task_reminder' && task.status==='submitted') ? task.reviewer_user_id : task.assigned_user_id) || isPlaceholderUser(user.auth_provider_user_id) ||
        !taskNoticeStillRelevant(notice.kind,task.status,task.due_at,notice.event_data) ||
        (['task_submitted','task_changes_requested','task_approved'].includes(notice.kind) && notice.event_data.revision !== task.notice_revision) ||
        (notice.kind==='task_reminder' && (task.dependency_blocked || task.needs_attention))) {
        const result=await receipt({email_state:'skipped'});if(result.error)throw result.error;skipped++;continue;
      }
      const prefs=resolveNotificationPrefs(user.notification_preferences_json);
      // The in-app feed and task detail resolve successor names at read time.
      // Keep the durable email payload generic so later successor privacy changes
      // cannot expose an old private title through a retry or receipt read.
      const body=notice.body || 'Open the task for the next action.';
      if(!(notice.kind==='task_reminder' ? prefs.task_reminders : prefs.task_updates) || !user.email ||
        (notice.email_payload && notice.email_payload.to!==user.email)) {
        const result=await receipt({email_state:'skipped'});if(result.error)throw result.error;skipped++;continue;
      }
      const payload=notice.email_payload ?? taskNoticeEmail(user.email,notice.title,body,`${appBaseUrl()}/task/${notice.task_id}`);
      if(!notice.email_payload) {const result=await receipt({email_payload:payload});if(result.error)throw result.error;}
      await send({...payload,idempotencyKey:`task-notice/${notice.id}`});
      const result=await receipt({email_state:'sent',email_sent_at:new Date().toISOString()});if(result.error)throw result.error;
      sent++;
    } catch {
      // The lease expires for safe periodic recovery; a persisted payload/key is reused.
      failed++;
    }
  }
  if(failed) throw new Error(`${failed} task notification deliveries need retry`);
  return {sent,skipped};
}

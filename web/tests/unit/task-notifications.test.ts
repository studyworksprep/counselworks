import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('@/lib/auth/resolve',()=>({isPlaceholderUser:(id:string)=>!id || /^(pending|invited)_/.test(id)}));
import { deliverTaskNotices, taskNoticeStillRelevant, type TaskNotice } from '@/lib/notifications/task-delivery';
import { taskNoticeEmail } from '@/lib/email';
import { resolveNotificationPrefs } from '@/lib/notifications/prefs';

function fixture(options:{allowed?:boolean;prefs?:object;status?:string;kind?:string;blocked?:boolean;receiptFailure?:boolean}={}) {
  const notice:TaskNotice={id:'notice',firm_id:'firm',user_id:'student',task_id:'task',workflow_id:null,kind:options.kind??'task_assigned',title:'Your task',body:'Open your task.',email_claim:'claim',email_payload:null,event_data:{status:'pending',due_at:null}};
  const writes:Record<string,unknown>[]=[];
  let failure=options.receiptFailure;
  const db={rpc:vi.fn(async(name:string)=>({data:name==='claim_task_notices'?[notice]:options.allowed!==false,error:null})),from:vi.fn((table:string)=>{
    let changes:Record<string,unknown>|undefined;
    const result=()=> {
      if(table==='notifications') {
        writes.push(changes!);
        if(changes?.email_payload)notice.email_payload=changes.email_payload as TaskNotice['email_payload'];
        if(changes?.email_state==='sent' && failure){failure=false;return {error:{message:'receipt lost'}};}
        return {error:null};
      }
      return {error:null,data:table==='tasks'?{id:'task',assigned_user_id:'student',reviewer_user_id:'student',status:options.status??'pending',due_at:null,dependency_blocked:options.blocked??false,needs_attention:false}:{role:'student',users:{email:'fictional@example.test',auth_provider_user_id:'user_fictional',notification_preferences_json:options.prefs}}};
    };
    const query={update:(value:Record<string,unknown>)=>{changes=value;return query;},select:()=>query,eq:()=>query,single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:(v:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};
    return query;
  })} as unknown as SupabaseClient;
  return {db,notice,writes};
}
beforeEach(()=>vi.clearAllMocks());
describe('durable task delivery',()=>{
  it('keeps the feed when email is disabled',async()=>{
    const f=fixture({kind:'task_approved',status:'completed',prefs:{task_updates:false}}),send=vi.fn();
    expect(await deliverTaskNotices(f.db,send)).toEqual({sent:0,skipped:1});
    expect(send).not.toHaveBeenCalled();
    expect(f.writes.some(write=>Object.hasOwn(write,'body'))).toBe(false);
    expect(f.writes).toContainEqual({email_state:'skipped'});
  });
  it.each([{allowed:false},{kind:'task_submitted',status:'completed'},{kind:'task_reminder',blocked:true},{kind:'task_reminder',prefs:{task_reminders:false}}])('skips revoked, stale or ineligible delivery: %j',async(options)=>{
    const f=fixture(options),send=vi.fn();
    expect(await deliverTaskNotices(f.db,send)).toEqual({sent:0,skipped:1});expect(send).not.toHaveBeenCalled();
  });
  it('reuses the persisted payload and provider key after an uncertain receipt',async()=>{
    const f=fixture({receiptFailure:true}),send=vi.fn(async()=>{});
    await expect(deliverTaskNotices(f.db,send)).rejects.toThrow('need retry');
    f.notice.body='Changed after the first attempt';
    await expect(deliverTaskNotices(f.db,send)).resolves.toEqual({sent:1,skipped:0});
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:'task-notice/notice',to:'fictional@example.test',text:expect.stringContaining('/task/task')}));
  });
  it('does not resend an earlier submission when the task returns to submitted later',async()=>{
    const f=fixture({kind:'task_submitted',status:'submitted'}),send=vi.fn();
    f.notice.event_data.revision=1;
    await deliverTaskNotices(f.db,send);expect(send).not.toHaveBeenCalled();
  });
  it('does not send a frozen payload to a replacement email address',async()=>{
    const f=fixture(); f.notice.email_payload=taskNoticeEmail('old@example.test','Title','Body','https://example.test/task/task');
    const send=vi.fn();await deliverTaskNotices(f.db,send);expect(send).not.toHaveBeenCalled();
  });
  it('ignores superseded due dates and honors independent preference choices',()=>{
    expect(taskNoticeStillRelevant('task_reminder','pending','new',{status:'pending',due_at:'old'})).toBe(false);
    expect(resolveNotificationPrefs({task_updates:false,task_reminders:true})).toMatchObject({task_updates:false,task_reminders:true});
  });
  it('escapes task content in email HTML',()=>{
    const email=taskNoticeEmail('fictional@example.test','<script>','A & B','https://example.test/task/1');
    expect(email.html).not.toContain('<script>');expect(email.html).toContain('&lt;script&gt;');expect(email.html).toContain('A &amp; B');
  });
});

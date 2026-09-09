import { afterEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({rpc:vi.fn(),deliver:vi.fn()}));
vi.mock('@/lib/queue/inngest',()=>({inngest:{createFunction:(options:unknown,trigger:unknown,run:()=>Promise<unknown>)=>({options,trigger,run})}}));
vi.mock('@/lib/db/client',()=>({createServerClient:()=>({rpc:f.rpc})}));
vi.mock('@/lib/notifications/task-delivery',()=>({deliverTaskNotices:f.deliver}));
import { workflowDeadlineRemindersJob, taskNotificationDeliveryJob } from '@/lib/queue/functions';
// Handler harness only: this is deliberately NOT evidence that an Inngest dev
// scheduler fired. That requires the configured disposable live acceptance run.
type Handler={run:()=>Promise<unknown>;trigger:{cron:string}};
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('scheduled reminder handler prepares overdue candidates and drains the durable queue',async()=>{
  vi.useFakeTimers();f.rpc.mockResolvedValue({data:2,error:null});f.deliver.mockResolvedValue({sent:1,skipped:1});
  const handler=workflowDeadlineRemindersJob as unknown as Handler;
  let result:unknown;
  setTimeout(async()=>{result=await handler.run();},1000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.rpc).toHaveBeenCalledWith('enqueue_task_reminders',{});
  expect(f.deliver).toHaveBeenCalledOnce();
  expect(result).toEqual({queued:2,sent:1,skipped:1});
});
it('periodic recovery drains queued transitions without requiring an external event',async()=>{
  f.deliver.mockResolvedValue({sent:1,skipped:0});
  const handler=taskNotificationDeliveryJob as unknown as Handler;
  expect(handler.trigger.cron).toBe('* * * * *');
  await handler.run();expect(f.deliver).toHaveBeenCalledOnce();
});
it('enqueue failure fails the reminder run for retry',async()=>{
  f.rpc.mockResolvedValue({data:null,error:{message:'unavailable'}});
  await expect((workflowDeadlineRemindersJob as unknown as Handler).run()).rejects.toThrow('Unable to prepare');
  expect(f.deliver).not.toHaveBeenCalled();
});

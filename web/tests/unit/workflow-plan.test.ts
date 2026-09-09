import {beforeEach,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
vi.mock("@/lib/auth/authorize",()=>({requireStaff:()=>{},requireStudentAccess:async()=>{}}));
vi.mock("@/lib/auth/task-owner",()=>({taskOwnerChoices:async()=>[{id:'a0000000-0000-4000-8000-000000000015',name:'Student',role:'student',ready:true}],resolveOwnerFromChoices:()=>({userId:'a0000000-0000-4000-8000-000000000015',role:'student',ready:true})}));
import {preparePlan} from "@/lib/db/queries";
import {dateOnly,offsetDate} from "@/lib/workflows/plan";
const ctx={firmId:'firm',dbUserId:'staff',role:'counselor'};
const id='a0000000-0000-4000-8000-000000000099';
let rows:Record<string,unknown>;
let writes:Record<string,unknown>[];
function db(){return {rpc:async(_name:string,args:Record<string,unknown>)=>{writes.push(args);return {data:{id:'saved',student_workflow_steps:args.p_steps},error:null};},from:(table:string)=>{const q:Record<string,unknown>={then:(resolve:(r:unknown)=>void)=>resolve({data:rows[table],error:null})};for(const name of ['select','eq','or','single','order','not','limit'])q[name]=()=>q;return q;}} as unknown as SupabaseClient;}
beforeEach(()=>{writes=[];rows={firm_memberships:{role:"counselor"},workflow_templates:{id:'template',name:'College plan',updated_at:'2026-01-01',instantiation_scope:'student_college',workflow_template_steps:[{id,name:'Draft',description:'Write',step_order:0,default_due_offset_days:10,default_assignee_role:'student',visibility_scope:'student',updated_at:'2026-01-01'}]},students:{graduation_year:2027,updated_at:'2026-01-01'},applications:[{id:'a',college_id:'college1',application_type:'ea',deadline_at:'2026-11-01T00:00:00Z',deadline_source:'explicit',updated_at:'2026-01-01'},{id:'b',college_id:'college2',application_type:'rd',deadline_at:'2027-01-01T00:00:00Z',deadline_source:'explicit',updated_at:'2026-01-01'}],firms:{timezone:'America/New_York'},student_workflows:[],student_colleges:{college_id:'college1',colleges:{name:'One'}}};});
it('validates calendar dates and moves days across leap years and DST',()=>{
  expect(dateOnly.safeParse('2026-02-29').success).toBe(false);
  expect(dateOnly.safeParse('2028-02-29').success).toBe(true);
  expect(offsetDate('2026-03-08',1)).toBe('2026-03-09');
  expect(offsetDate('2026-11-01',1)).toBe('2026-11-02');
  expect(offsetDate('2028-03-01',-1)).toBe('2028-02-29');
});
it('scopes each college schedule to its own application',async()=>{
  const first=await preparePlan(db(),ctx,{templateId:'template',studentId:'student',studentCollegeId:'sc1'});
  expect(first.steps[0].due_date).toBe('2026-09-27');expect(first.steps[0].snapshot_json.applicationId).toBe('a');
  rows.student_colleges={college_id:'college2',colleges:{name:'Two'}};
  const second=await preparePlan(db(),ctx,{templateId:'template',studentId:'student',studentCollegeId:'sc2'});
  expect(second.steps[0].due_date).toBe('2026-11-27');expect(second.steps[0].snapshot_json.applicationId).toBe('b');
});
it('persists personalization and manual date provenance without changing sources',async()=>{
  const input={templateId:'template',studentId:'student',studentCollegeId:'sc1'};
  const before=await preparePlan(db(),ctx,input);
  const edited=await preparePlan(db(),ctx,{...input,edits:{[id]:{title:'Custom',description:'Private instance',priority:'high',due:'2026-10-04',owner:null}}});
  expect(edited.fingerprint).toBe(before.fingerprint);
  expect(edited.steps[0]).toMatchObject({due_date:'2026-10-04',assigned_user_id:null,snapshot_json:{title:'Custom',dueSource:'manual',priority:'high',ownerReady:false}});
  expect((await preparePlan(db(),ctx,input)).steps).toEqual(before.steps);
});
it('rejects stale sources by changing the preview fingerprint',async()=>{
  const input={templateId:'template',studentId:'student',studentCollegeId:'sc1'};
  const before=await preparePlan(db(),ctx,input);
  (rows.applications as {updated_at:string}[])[0].updated_at='2026-02-01';
  expect((await preparePlan(db(),ctx,input)).fingerprint).not.toBe(before.fingerprint);
});
it('labels unverified and absent application deadlines',async()=>{
  (rows.applications as {deadline_source:string}[])[0].deadline_source='legacy_unknown';
  const input={templateId:'template',studentId:'student',studentCollegeId:'sc1'};
  expect((await preparePlan(db(),ctx,input)).steps[0].snapshot_json.estimate).toBe(true);
  expect((await preparePlan(db(),ctx,{...input,edits:{[id]:{due:'2026-10-04'}}})).steps[0].snapshot_json.estimate).toBe(false);
  rows.applications=[];
  expect((await preparePlan(db(),ctx,input)).steps[0].snapshot_json.estimate).toBe(true);
});
it('returns identical defaults on repeated single and cohort resolver calls',async()=>{
  const input={templateId:'template',studentId:'student',studentCollegeId:'sc1'};
  expect((await preparePlan(db(),ctx,input)).steps).toEqual((await preparePlan(db(),ctx,input)).steps);
});

import {calendarDayBounds} from "@/lib/tasks/due-date";
it('uses firm midnight boundaries for due-today counts during DST and UTC rollover',()=>{
  expect(calendarDayBounds(Date.parse('2026-03-08T16:00:00Z'),'America/New_York')).toEqual({today:'2026-03-08',start:'2026-03-08T05:00:00.000Z',end:'2026-03-09T04:00:00.000Z'});
  expect(calendarDayBounds(Date.parse('2026-11-01T16:00:00Z'),'America/New_York')).toEqual({today:'2026-11-01',start:'2026-11-01T04:00:00.000Z',end:'2026-11-02T05:00:00.000Z'});
  expect(calendarDayBounds(Date.parse('2026-09-09T02:00:00Z'),'America/Los_Angeles').today).toBe('2026-09-08');
});

import {instantiateWorkflowFromTemplate} from "@/modules/workflows/service";
it('revalidates sources at save and persists the exact preview settings',async()=>{
  const input={templateId:'template',studentId:'student',studentCollegeId:'sc1'};
  const preview=await preparePlan(db(),ctx,input);
  const options={...input,firmId:ctx.firmId,createdByUserId:ctx.dbUserId,previewFingerprint:preview.fingerprint};
  expect((await instantiateWorkflowFromTemplate(db(),options)).error).toBeNull();
  expect(writes[0].p_steps).toEqual(preview.steps);
  writes=[];(rows.applications as {updated_at:string}[])[0].updated_at='2026-02-01';
  expect((await instantiateWorkflowFromTemplate(db(),options)).error?.message).toContain('Preview again');
  expect(writes).toHaveLength(0);
});

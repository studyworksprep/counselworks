import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/clerk';
import { e2eEnv } from './helpers/env';

const firm='a0000000-0000-4000-8000-000000000001';
const sam='a0000000-0000-4000-8000-000000000041';
const template=randomUUID(), steps=[randomUUID(),randomUUID(),randomUUID()];
const prefix=`UX6 ${randomUUID().slice(0,8)}`;
let db:SupabaseClient, workflow:string, taskId:string, essayId:string;

test.describe.serial('UX6 integrated plan and essay acceptance',()=>{
 test.skip(!e2eEnv()||process.env.E2E_UX_REVIEW!=='1','Requires preserved local review identities');
 test.beforeAll(async()=>{
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  expect(new URL(process.env.E2E_BASE_URL??'http://localhost:3000').hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  expect((await db.from('workflow_templates').insert({id:template,firm_id:firm,name:prefix,workflow_type:'custom',is_active:true,instantiation_scope:'student'})).error).toBeNull();
  for(const [i,id] of steps.entries())expect((await db.from('workflow_template_steps').insert({id,workflow_template_id:template,name:`${prefix} ${['essay','next action','private staff'][i]}`,step_order:i,step_type:'task',default_due_offset_days:2+i,default_assignee_role:i===2?'counselor':'student',visibility_scope:i===2?'staff':'family',depends_on_step_id:i===1?steps[0]:null,description:'Integrated local review acceptance'})).error).toBeNull();
 });
 test.afterAll(async()=>{
  if(!db)return;
  const workflows=await db.from('student_workflows').select('id').eq('firm_id',firm).eq('workflow_template_id',template);
  for(const wf of workflows.data??[]){
   const records=await db.from('student_workflow_steps').select('linked_task_id').eq('student_workflow_id',wf.id);
   expect((await db.from('student_workflows').delete().eq('firm_id',firm).eq('id',wf.id)).error).toBeNull();
   const ids=(records.data??[]).map(s=>s.linked_task_id).filter(Boolean);
   if(ids.length)expect((await db.from('tasks').delete().eq('firm_id',firm).in('id',ids)).error).toBeNull();
  }
  expect((await db.from('workflow_templates').delete().eq('firm_id',firm).eq('id',template)).error).toBeNull();
  expect((await db.from('essay_drafts').delete().eq('firm_id',firm).eq('title',`${prefix} essay draft`)).error).toBeNull();
 });
 test('counselor assigns a plan and links an essay with required review',async({page})=>{
  await signInAs(page,'cw-ux-counselor+clerk_test@example.com',`/workflows/${template}`);
  await page.getByRole('button',{name:/Apply to Student/i}).click();
  const dialog=page.getByRole('dialog',{name:'Apply plan',exact:true});
  await dialog.getByRole('combobox',{name:'Student',exact:true}).selectOption(sam);
  await dialog.getByRole('button',{name:'Preview plan',exact:true}).click();
  await dialog.getByRole('button',{name:'Apply plan',exact:true}).click();
  const link=dialog.getByRole('link',{name:/View student's plan/});await expect(link).toBeVisible();
  workflow=(await link.getAttribute('href'))!.split('#plan-')[1];
  const step=await db.from('student_workflow_steps').select('linked_task_id').eq('student_workflow_id',workflow).eq('template_step_id',steps[0]).single();expect(step.error).toBeNull();taskId=step.data!.linked_task_id;
  await page.goto('/essays');await page.getByRole('button',{name:'New Essay',exact:true}).first().click();
  const form=page.locator('form:has(select[name="essay_type"])');
  await form.locator('[name="student_id"]').selectOption(sam);await form.locator('[name="visibility_scope"]').selectOption('student');
  await form.locator('[name="title"]').fill(`${prefix} essay draft`);await form.locator('[name="essay_type"]').selectOption('personal_statement');
  await form.locator('[name="prompt_text"]').fill('Describe a challenge you overcame.');await form.locator('[name="word_count_target"]').fill('650');
  await form.getByRole('button',{name:'Create Draft'}).click();await page.waitForURL(/\/essays\/[0-9a-f-]{36}$/);essayId=page.url().split('/').pop()!;
  await page.goto(`/tasks/${taskId}`);await page.getByLabel('Linked work').selectOption(`essay:${essayId}`);await page.getByRole('button',{name:'Save linked work'}).click();
  await expect(page.getByRole('link',{name:'Open essay',exact:true})).toHaveAttribute('href',`/essays/${essayId}`);
  await page.getByLabel('Completion requirement').selectOption('review_required');await page.getByLabel('Reviewer',{exact:true}).selectOption({label:'Carl Counselman'});
  await page.getByRole('button',{name:'Save completion requirement'}).click();await expect(page.getByLabel('Completion requirement')).toHaveValue('review_required');
  await expect.poll(async()=>(await db.from('tasks').select('completion_mode').eq('id',taskId).single()).data?.completion_mode).toBe('review_required');
  await page.reload();await expect(page.getByLabel('Completion requirement')).toHaveValue('review_required');
 });
 test('student submits, counselor requests changes, and dependent work remains blocked',async({browser},info)=>{
  const sc=await browser.newContext(),cc=await browser.newContext();const student=await sc.newPage(),counselor=await cc.newPage();
  try{
   await signInAs(student,'cw-ux-student+clerk_test@example.com',`/task/${taskId}`);
   await student.getByRole('link',{name:'Open essay',exact:true}).focus();await student.keyboard.press('Enter');await student.waitForURL(`**/student-essays/${essayId}`);
   await student.getByPlaceholder('Start writing...').fill(`${prefix}: I rebuilt our robotics code and learned to ask for help.`);
   await student.getByRole('button',{name:'Save Draft'}).click();await student.getByRole('button',{name:'Submit for review',exact:true}).click();await expect(student.getByText('With your counselor')).toBeVisible();
   await signInAs(counselor,'cw-ux-counselor+clerk_test@example.com','/tasks/review');
   await counselor.getByRole('link',{name:`${prefix} essay`,exact:true}).click();
   await counselor.getByLabel('Review feedback (required for changes)').fill('Explain the impact on your team.');await counselor.getByRole('button',{name:'Request changes',exact:true}).click();await expect(counselor.getByText('Changes requested',{exact:true})).toBeVisible();
   const blocked=await db.from('student_workflow_steps').select('status,linked_task_id').eq('student_workflow_id',workflow).eq('template_step_id',steps[1]).single();expect(blocked.data?.status).toBe('blocked');
   await student.goto(`/task/${taskId}`);await expect(student.getByText('Changes requested',{exact:true})).toBeVisible();
   for(const width of [390,768,1024,1057,1366]){await student.setViewportSize({width,height:900});expect(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await student.screenshot({path:info.outputPath(`review-${width}.png`),fullPage:true});}
  }finally{await sc.close();await cc.close();}
 });
 test('resubmission and approval expose the real dependent next action',async({browser})=>{
  const sc=await browser.newContext(),cc=await browser.newContext();const student=await sc.newPage(),counselor=await cc.newPage();
  try{
   await signInAs(student,'cw-ux-student+clerk_test@example.com',`/student-essays/${essayId}`);await expect(student.getByText('Revision requested',{exact:true})).toBeVisible();
   await student.getByPlaceholder('Start writing...').fill(`${prefix}: Our entire team could contribute to the robot after I documented and simplified the code.`);
   await student.getByRole('button',{name:'Submit for review',exact:true}).click();await expect(student.getByText('With your counselor')).toBeVisible();
   await signInAs(counselor,'cw-ux-counselor+clerk_test@example.com',`/tasks/${taskId}`);await counselor.getByRole('button',{name:'Approve submission',exact:true}).click();await expect(counselor.getByText('Complete.',{exact:true})).toBeVisible();
   await student.goto(`/task/${taskId}`);const next=student.getByRole('link',{name:`${prefix} next action`,exact:true});await expect(next).toBeVisible();await next.focus();await student.keyboard.press('Enter');
   await expect(student.getByRole('heading',{name:`${prefix} next action`,exact:true})).toBeVisible();await student.getByRole('button',{name:'Mark complete',exact:true}).click();await expect(student.getByText('Complete.',{exact:true})).toBeVisible();
  }finally{await sc.close();await cc.close();}
 });
 for(const role of ['owner','student','parent','parent2'])test(`${role} sees only permitted plan and essay information`,async({page})=>{
  await signInAs(page,`cw-ux-${role}+clerk_test@example.com`,role==='owner'?`/students/${sam}`:role==='student'?'/student-tasks':'/family-tasks');
  const plan=page.locator(`#plan-${workflow}`);
  if(role==='owner')await expect(plan).toContainText(`${prefix} private staff`);
  else{await expect(page.getByText(`${prefix} private staff`,{exact:true})).toHaveCount(0);await expect(page.getByText(`${prefix} next action`,{exact:true}).first()).toBeVisible();}
  if(role.startsWith('parent')){await page.goto(`/task/${taskId}`);await expect(page.getByRole('button',{name:'Approve submission'})).toHaveCount(0);await expect(page.getByText(/Submitted essay — version/)).toHaveCount(0);await expect(page.getByRole('link',{name:'Open essay',exact:true})).toHaveCount(0);}
 });
});

import {randomUUID} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {signInAs} from './helpers/clerk';
import {e2eEnv} from './helpers/env';

const sam='a0000000-0000-4000-8000-000000000041', child=randomUUID();
const firm='a0000000-0000-4000-8000-000000000001', family='a0000000-0000-4000-8000-000000000021';
const carl='a0000000-0000-4000-8000-000000000012';
const prefix=`UX5 ${randomUUID().slice(0,8)}`, parentTask=randomUUID(), blocker=randomUUID();
let db:SupabaseClient, settings:Record<string,unknown>|null, windows:Record<string,unknown>[], paula:string;
let preferenceRows:{id:string;notification_preferences_json:unknown}[]=[];
test.use({actionTimeout:15_000});
test.describe.serial('UX5 family priorities and booking',()=>{
 test.skip(!e2eEnv()||process.env.E2E_UX_REVIEW!=='1','Requires preserved local identities');
 test.beforeAll(async()=>{
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  expect(new URL(process.env.E2E_BASE_URL??'http://localhost:3000').hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  settings=(await db.from('staff_booking_settings').select('*').eq('firm_id',firm).eq('user_id',carl).maybeSingle()).data;
  windows=(await db.from('staff_availability_windows').select('*').eq('firm_id',firm).eq('user_id',carl)).data??[];
  const users=await db.from('users').select('id,email,notification_preferences_json').in('email',['cw-ux-owner+clerk_test@example.com','cw-ux-counselor+clerk_test@example.com','cw-ux-parent+clerk_test@example.com','cw-ux-student+clerk_test@example.com']);
  expect(users.error).toBeNull();preferenceRows=users.data!;paula=users.data!.find(u=>u.email==='cw-ux-parent+clerk_test@example.com')!.id;
  expect((await db.from('students').insert({id:child,firm_id:firm,family_id:family,first_name:'Alex',last_name:prefix,graduation_year:2030,status:'active',created_by_user_id:carl,updated_by_user_id:carl})).error).toBeNull();
  expect((await db.from('student_staff_assignments').insert({firm_id:firm,student_id:child,user_id:carl,assignment_type:'primary_counselor',is_primary:true})).error).toBeNull();
  expect((await db.from('tasks').insert({id:parentTask,firm_id:firm,student_id:child,title:`${prefix} parent decision`,task_type:'general',assigned_user_id:paula,owner_role:'parent_guardian',owner_pending:false,visibility_scope:'family',status:'pending',created_by_user_id:carl,updated_by_user_id:carl})).error).toBeNull();
 });
 test.afterAll(async()=>{
  if(!db)return;
  // Restore only the exact fictional users/rules changed by this run.
  for(const row of preferenceRows)expect((await db.from('users').update({notification_preferences_json:row.notification_preferences_json}).eq('id',row.id)).error).toBeNull();
  expect((await db.from('staff_availability_windows').delete().eq('firm_id',firm).eq('user_id',carl)).error).toBeNull();
  if(windows?.length)expect((await db.from('staff_availability_windows').insert(windows)).error).toBeNull();
  if(settings)expect((await db.from('staff_booking_settings').upsert(settings,{onConflict:'firm_id,user_id'})).error).toBeNull();
  else expect((await db.from('staff_booking_settings').delete().eq('firm_id',firm).eq('user_id',carl)).error).toBeNull();
  expect((await db.from('meetings').delete().eq('firm_id',firm).eq('id',blocker)).error).toBeNull();
  expect((await db.from('meetings').delete().eq('firm_id',firm).eq('agenda',prefix)).error).toBeNull();
  expect((await db.from('tasks').delete().eq('firm_id',firm).eq('id',parentTask)).error).toBeNull();
  expect((await db.from('students').delete().eq('firm_id',firm).eq('id',child)).error).toBeNull();
 });
 for(const role of ['owner','counselor'])test(`${role} finds and saves personal settings independently of administration`,async({page})=>{
  await signInAs(page,`cw-ux-${role}+clerk_test@example.com`,'/settings');
  const personal=page.locator('#personal-settings');await expect(personal.getByRole('heading',{name:'My settings',exact:true})).toBeVisible();
  await expect(personal.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
  const form=personal.locator('form:has(select[name="message_email"])');
  await form.getByRole('button',{name:'Save preferences'}).click();await expect(form.getByText('Saved',{exact:true})).toBeVisible();
  if(role==='owner')await expect(page.locator('#firm-settings').getByRole('heading',{name:/Staff Management/})).toBeVisible();
  else {
   await expect(page.locator('#firm-settings')).toHaveCount(0);
   const booking=personal.locator('form:has(input[name="min_notice_hours"])');
   await booking.locator('[name="enabled"]').check();await booking.locator('[name="timezone"]').selectOption('America/New_York');
   await booking.locator('[name="min_notice_hours"]').fill('1');await booking.locator('[name="max_days_ahead"]').fill('7');
   for(let day=0;day<7;day++){await booking.locator(`[name="weekday_${day}_enabled"]`).check();await booking.locator(`[name="weekday_${day}_start"]`).fill('09:00');await booking.locator(`[name="weekday_${day}_end"]`).fill('17:00');}
   await booking.getByRole('button',{name:'Save Availability'}).click();await expect(booking.getByText('Saved',{exact:true})).toBeVisible();
   await page.reload();await expect(page.locator('[name="max_days_ahead"]')).toHaveValue('7');
  }
 });
 test('parent finds child actions, billing and preferences at every width',async({page},info)=>{
  await signInAs(page,'cw-ux-parent+clerk_test@example.com','/family-dashboard');
  for(const width of [390,768,1024,1057,1366]){
   await page.setViewportSize({width,height:900});
   await expect(page.getByRole('heading',{name:`Alex ${prefix}`,exact:true})).toBeVisible();
   await expect(page.getByRole('link',{name:`${prefix} parent decision`,exact:true}).first()).toBeVisible();
   await expect(page.getByRole('link',{name:'Review & sign',exact:true})).toBeVisible();
   await expect(page.getByRole('link',{name:'View invoices & pay',exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:info.outputPath(`family-${width}.png`),fullPage:true});
  }
  await page.getByRole('navigation',{name:'Family quick actions'}).getByRole('link',{name:'Billing & agreements'}).focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/family-billing');await expect(page.getByRole('heading',{name:'Invoices',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const row=page.getByTestId('invoice-row').first();expect((await row.locator('p').first().boundingBox())!.width).toBeGreaterThan(180);
  await page.goto('/family-settings');await expect(page.getByRole('heading',{name:'My settings',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'New message emails'}).selectOption('off');await page.getByRole('button',{name:'Save preferences'}).click();
  await expect(page.getByText('Saved',{exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('combobox',{name:'New message emails'})).toHaveValue('off');
  await page.goto('/settings');await expect(page).toHaveURL('/family-dashboard');
  const axe=await new AxeBuilder({page}).include('main').analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
 });
 test('booking changes days and handles a taken slot without losing note or attendees',async({page},info)=>{
  await signInAs(page,'cw-ux-parent+clerk_test@example.com',`/family-booking?student=${sam}&staff=${carl}`);
  await page.getByLabel('Anything your counselor should know? (optional)').fill(prefix);
  const day=page.getByLabel('Choose a day');const options=await day.locator('option').allTextContents();expect(options.length).toBeGreaterThan(1);
  await page.locator('button[aria-pressed]').first().click();
  const originalStart=await page.locator('input[name="start"]').inputValue();await day.selectOption({label:options[0]});await expect(page.locator('input[name="start"]')).toHaveValue(originalStart);
  await day.selectOption({label:options[1]});await expect(page.locator('main').getByRole('alert')).toContainText('Day changed');await expect(page.getByRole('button',{name:'Confirm booking'})).toBeDisabled();
  await page.locator('button[aria-pressed]').first().click();await page.getByLabel('Invite Sam too').uncheck();
  const start=await page.locator('input[name="start"]').inputValue();
  expect((await db.from('meetings').insert({id:blocker,firm_id:firm,family_id:family,student_id:sam,title:prefix,meeting_type:'counseling',scheduled_start_at:start,scheduled_end_at:new Date(Date.parse(start)+60*60*1000).toISOString(),visibility_scope:'family',created_by_user_id:carl,updated_by_user_id:carl})).error).toBeNull();
  expect((await db.from('meeting_attendees').insert({meeting_id:blocker,user_id:carl,attendance_status:'accepted'})).error).toBeNull();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Confirm booking'}).click();await expect(page.locator('main').getByRole('alert')).toContainText('no longer available');
  await expect(page.getByLabel('Anything your counselor should know? (optional)')).toHaveValue(prefix);
  await expect(page.getByLabel('Invite Sam too')).not.toBeChecked();
  await expect(page.getByRole('button',{name:'Confirm booking'})).toBeDisabled();
  await page.locator('button[aria-pressed]').first().click();
  for(const width of [390,1366]){await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Continue',exact:true}).click();const box=await page.getByRole('button',{name:'Confirm booking'}).boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(844);await page.screenshot({path:info.outputPath(`booking-${width}.png`)});}
  await page.getByRole('button',{name:'Confirm booking'}).click();await expect(page.getByRole('heading',{name:"You're booked"})).toBeVisible();
  const meeting=await db.from('meetings').select('id,agenda,student_id,meeting_attendees(user_id)').eq('firm_id',firm).eq('agenda',prefix).single();expect(meeting.error).toBeNull();expect(meeting.data?.student_id).toBe(sam);expect(meeting.data?.meeting_attendees.map(a=>a.user_id).sort()).toEqual([carl,paula].sort());
 });
 test('second parent sees shared work but cannot complete the first parent task',async({page})=>{
  await signInAs(page,'cw-ux-parent2+clerk_test@example.com',`/family-tasks/${parentTask}`);
  await expect(page.getByRole('heading',{name:`${prefix} parent decision`,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Mark complete',exact:true})).toHaveCount(0);
  await page.goto('/family-dashboard');await expect(page.getByRole('heading',{name:`Alex ${prefix}`,exact:true})).toBeVisible();
 });
 test('selected parent can act on their child task',async({page})=>{
  await signInAs(page,'cw-ux-parent+clerk_test@example.com',`/family-tasks/${parentTask}`);await page.getByRole('button',{name:'Mark complete',exact:true}).click();await expect(page.getByText('Complete.',{exact:true})).toBeVisible();
 });
 test('student keeps personal settings only',async({page})=>{
  await signInAs(page,'cw-ux-student+clerk_test@example.com','/student-settings');await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.getByText('Saved',{exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
  await page.goto('/settings');await expect(page).toHaveURL('/student-dashboard');
 });
});

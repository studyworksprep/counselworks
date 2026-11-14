import { randomUUID } from "node:crypto";
import { createClient,type SupabaseClient } from "@supabase/supabase-js";
import { test,expect,type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser,signInAs } from "./helpers/clerk";

const env=e2eEnv();
test.describe.serial("Student interview and narrative bank",()=>{
 test.use({actionTimeout:20_000});
 test.skip(!env,"Requires configured Clerk development test identities");
 const firm="a0000000-0000-4000-8000-000000000001",counselor="e2e00000-0000-4000-8000-000000000012";
 const student=randomUUID(),family=randomUUID(),studentUser=randomUUID(),parent1=randomUUID(),parent2=randomUUID(),essay=randomUUID();
 const suffix=randomUUID().slice(0,8);
 const emails={student:`e2e-student-interview-${suffix}+clerk_test@example.com`,parent1:`e2e-parent1-interview-${suffix}+clerk_test@example.com`,parent2:`e2e-parent2-interview-${suffix}+clerk_test@example.com`};
 const memory=`A chipped blue mug from our Saturday repair project ${suffix}`,privateParent=`Private family planning context ${suffix}`,storyTitle=`Repairing things together ${suffix}`,narrativeTitle=`Patient problem solving ${suffix}`,question=`What did you do when the first repair failed? ${suffix}`;
 let db:SupabaseClient,storyId:string;
 async function done(result:{error:unknown}){expect(result.error).toBeNull();}
 async function openQuestion(page:Page,key:string) {const card=page.locator(`details[data-question="${key}"]`);await card.locator("summary").click();return card;}
 async function stage(page:Page,n:number){await page.getByRole("button",{name:new RegExp(`Stage ${n} `)}).click();}
 async function waitSaved(key:string,respondent:string,text:string) {
  await expect.poll(async()=>{const r=await db.from("student_interview_answers").select("answer").eq("firm_id",firm).eq("student_id",student).eq("respondent_user_id",respondent).eq("question_key",key).maybeSingle();return r.data?.answer;}).toBe(text);
 }
 test.beforeAll(async()=>{
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  expect(new URL(process.env.E2E_BASE_URL??"http://localhost:3000").hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  for(const [kind,email]of Object.entries(emails))await ensureClerkUser(email,"Interview",kind);
  await done(await db.from("users").insert([{id:studentUser,email:emails.student,first_name:"Interview",last_name:"Student",auth_provider_user_id:`invited_interview_student_${suffix}`},{id:parent1,email:emails.parent1,first_name:"Interview",last_name:"Parent One",auth_provider_user_id:`invited_interview_parent1_${suffix}`},{id:parent2,email:emails.parent2,first_name:"Interview",last_name:"Parent Two",auth_provider_user_id:`invited_interview_parent2_${suffix}`}]));
  await done(await db.from("firm_memberships").insert([{firm_id:firm,user_id:studentUser,role:"student"},{firm_id:firm,user_id:parent1,role:"parent_guardian"},{firm_id:firm,user_id:parent2,role:"parent_guardian"}]));
  await done(await db.from("families").insert({id:family,firm_id:firm,household_name:`Interview household ${suffix}`,created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("family_members").insert([{firm_id:firm,family_id:family,user_id:parent1,relationship_type:"parent"},{firm_id:firm,family_id:family,user_id:parent2,relationship_type:"parent"}]));
  await done(await db.from("students").insert({id:student,firm_id:firm,family_id:family,user_id:studentUser,first_name:"Interview",last_name:`Student ${suffix}`,graduation_year:2027,school_name:"Example High",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("student_profiles").upsert({firm_id:firm,student_id:student},{onConflict:"student_id"}));
  await done(await db.from("student_staff_assignments").insert({firm_id:firm,student_id:student,user_id:counselor,assignment_type:"counselor"}));
  await done(await db.from("essay_drafts").insert({id:essay,firm_id:firm,student_id:student,essay_type:"personal_statement",title:`Interview essay ${suffix}`,body:"Existing essay writing stays intact.",visibility_scope:"student",created_by_user_id:counselor,updated_by_user_id:counselor}));
 });
 test.afterAll(async()=>{
  if(!db)return;
  for(const table of ["student_strategy_sections","student_story_essay_links","student_interview_followups","student_story_bank","student_interview_checkpoints","student_interview_answers"])await done(await db.from(table).delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("essay_draft_versions").delete().eq("essay_draft_id",essay));
  await done(await db.from("essay_drafts").delete().eq("firm_id",firm).eq("id",essay));
  await done(await db.from("student_staff_assignments").delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("student_profiles").delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("students").delete().eq("firm_id",firm).eq("id",student));
  await done(await db.from("family_members").delete().eq("firm_id",firm).eq("family_id",family));
  await done(await db.from("families").delete().eq("firm_id",firm).eq("id",family));
  await done(await db.from("firm_memberships").delete().eq("firm_id",firm).in("user_id",[studentUser,parent1,parent2]));
  await done(await db.from("users").delete().in("id",[studentUser,parent1,parent2]));
 });
 test("student records ranked priorities, can remain undecided, and captures a story",async({page})=>{
  await signInAs(page,emails.student,"/student-interview");
  const priorities=await openQuestion(page,"P1");
  await priorities.getByLabel("Priority 1",{exact:true}).selectOption("Community and belonging");
  await priorities.getByLabel("Priority 2",{exact:true}).selectOption("Cost and financial aid");
  await expect(page.getByRole("button",{name:/Stage 2 /})).toBeDisabled();
  await priorities.getByRole("button",{name:"Save response",exact:true}).click();
  await waitSaved("P1",studentUser,"Community and belonging\nCost and financial aid");
  const major=await openQuestion(page,"A3");
  await major.getByLabel("Where you are with this question").selectOption("unsure");
  await major.getByRole("button",{name:"Save response",exact:true}).click();
  await waitSaved("A3",studentUser,"");
  await page.getByRole("button",{name:"Mark this stage reviewed"}).click();
  await expect.poll(async()=> (await db.from("student_interview_checkpoints").select("stage").eq("firm_id",firm).eq("student_id",student)).data?.length).toBe(1);
  await stage(page,2);await page.getByLabel("Explore a section").selectOption("H");
  const object=await openQuestion(page,"H1");await object.getByLabel("Your response").fill(memory);
  await object.getByRole("button",{name:"Save response",exact:true}).click();
  await waitSaved("H1",studentUser,memory);
  await object.getByRole("button",{name:"Save as story"}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(storyTitle);
  await dialog.getByRole("button",{name:"Save story",exact:true}).click();await expect(dialog).toHaveCount(0);
  const saved=await db.from("student_story_bank").select("id,source_answer_id").eq("firm_id",firm).eq("student_id",student).eq("title",storyTitle).single();expect(saved.error).toBeNull();expect(saved.data?.source_answer_id).toBeTruthy();storyId=saved.data!.id;
  expect((await db.from("student_story_sources").select("original_text").eq("firm_id",firm).eq("entry_id",storyId).single()).data?.original_text).toBe(memory);
 });
 test("concurrent response edits preserve the first save and retain the later writer's unsaved text",async({page,browser})=>{
  await signInAs(page,emails.student,"/student-interview");
  await stage(page,2);await page.getByLabel("Explore a section").selectOption("H");
  const current=await openQuestion(page,"H1");
  const otherContext=await browser.newContext();
  const stale=await otherContext.newPage();
  await signInAs(stale,emails.student,"/student-interview");
  await stage(stale,2);await stale.getByLabel("Explore a section").selectOption("H");
  const old=await openQuestion(stale,"H1");
  await old.getByLabel("Your response").fill("A later writer's unsaved draft");
  await current.getByLabel("Your response").fill(`${memory} — updated context`);
  await expect(current.getByRole("button",{name:"Save as story",exact:true})).toBeDisabled();
  await current.getByRole("button",{name:"Save response",exact:true}).click();
  await waitSaved("H1",studentUser,`${memory} — updated context`);
  await old.getByRole("button",{name:"Save response",exact:true}).click();
  await expect(old.getByRole("alert")).toContainText("changed in another window");
  await expect(old.getByLabel("Your response")).toHaveValue("A later writer's unsaved draft");
  stale.on("dialog",dialog=>dialog.accept());await otherContext.close();
 });
 for(const [kind,user,text,audience]of [["parent1",parent1,privateParent,"counselor"],["parent2",parent2,`A separate parent perspective ${suffix}`,"family"]] as const) test(`${kind} has an independent interview and no access to student-private stories`,async({page})=>{
  await signInAs(page,emails[kind],`/family-interview/${student}`);
  expect(await page.content()).not.toContain(memory);
  if(kind==="parent2")expect(await page.content()).not.toContain(privateParent);
  const card=await openQuestion(page,"R2");await card.getByLabel("Your response").fill(text);await card.getByLabel("Who can see this response").selectOption(audience);
  await card.getByRole("button",{name:"Save response",exact:true}).click();await waitSaved("R2",user,text);
  await page.getByRole("button",{name:"Shared story bank",exact:true}).click();
  await expect(page.getByRole("article",{name:storyTitle})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Add story",exact:true})).toHaveCount(0);
 });
 test("counselor reads each voice separately and asks a targeted follow-up",async({page})=>{
  await signInAs(page,env!.counselorEmail,`/students/${student}/interview`);
  await stage(page,2);await page.getByLabel("Explore a section").selectOption("H");
  const object=await openQuestion(page,"H1");await expect(object.getByText(`${memory} — updated context`,{exact:true})).toBeVisible();
  await expect(object.getByLabel("Your response")).toHaveCount(0);
  await object.getByRole("button",{name:"Ask about this response"}).click();
  await page.getByLabel("Follow-up question").fill(question);
  await page.getByRole("button",{name:"Add follow-up",exact:true}).click();
  await expect(page.getByText(question,{exact:false}).first()).toBeVisible();
  await page.getByLabel("Whose interview?").selectOption(parent1);await stage(page,1);
  const context=await openQuestion(page,"R2");await expect(context.getByText(privateParent,{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Story and narrative bank",exact:true}).click();
  await page.getByRole("article",{name:storyTitle}).getByRole("button",{name:"Edit story"}).click();
  await expect(page.getByRole("dialog").getByLabel("Who can see this item")).toHaveCount(0);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
 });
 test("student confirms and shares a supported narrative, replies, and connects an essay",async({page})=>{
  await signInAs(page,emails.student,"/student-interview?view=bank");
  expect(await page.content()).not.toContain(privateParent);
  const follow=page.locator("details").filter({has:page.locator("summary").filter({hasText:question})});
  await follow.locator("summary").click();
  await follow.getByLabel("Your reply").fill("I tried a smaller part first and asked for help.");
  await follow.getByRole("button",{name:"Send reply",exact:true}).click();
  const story=page.getByRole("article",{name:storyTitle});await story.getByRole("button",{name:"Edit story"}).click();
  const dialog=page.getByRole("dialog");await dialog.getByLabel("Does this feel accurate?").selectOption("confirmed");await dialog.getByLabel("Who can see this item").selectOption("family");
  await dialog.getByLabel("What happened").fill("We repaired the mug together, and I learned to be patient.");
  await dialog.getByRole("button",{name:"Save changes"}).click();await expect(dialog).toHaveCount(0);
  await story.getByLabel("Essay to connect").selectOption(essay);await story.getByRole("button",{name:"Link to essay",exact:true}).click();
  await expect(story.getByRole("link",{name:`Interview essay ${suffix}`})).toBeVisible();
  await page.getByRole("button",{name:"Add narrative",exact:true}).click();
  await dialog.getByLabel("Title").fill(narrativeTitle);await dialog.getByLabel("What this theme means").fill("I like patient, collaborative problem solving.");
  await dialog.getByRole("checkbox",{name:new RegExp(storyTitle)}).check();
  await dialog.getByLabel("Does this feel accurate?").selectOption("confirmed");await dialog.getByLabel("Who can see this item").selectOption("family");
  await dialog.getByRole("button",{name:"Save narrative",exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article",{name:narrativeTitle})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:"/tmp/counselworks-story-bank-desktop.png",fullPage:true});
  const stored=await db.from("essay_drafts").select("body,visibility_scope").eq("firm_id",firm).eq("id",essay).single();
  expect(stored.data).toEqual({body:"Existing essay writing stays intact.",visibility_scope:"student"});
  await page.goto(`/student-essays/${essay}`);await expect(page.getByRole("region",{name:"Stories connected to this essay"}).getByText(storyTitle,{exact:true})).toBeVisible();
 });
 test("parent sees only explicitly shared stories and narratives, with no private essay metadata",async({page})=>{
  await signInAs(page,emails.parent1,`/family-interview/${student}?view=bank`);
  await expect(page.getByRole("article",{name:storyTitle})).toBeVisible();await expect(page.getByRole("article",{name:narrativeTitle})).toBeVisible();
  expect(await page.content()).not.toContain(`Interview essay ${suffix}`);
  expect(await page.content()).not.toContain(memory);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
  await page.screenshot({path:"/tmp/counselworks-parent-interview-mobile.png",fullPage:true});
 });
 test("a counselor revision waits for student confirmation before family can see it",async({page})=>{
  await signInAs(page,env!.counselorEmail,`/students/${student}/interview?view=bank`);
  await page.getByRole("article",{name:storyTitle}).getByRole("button",{name:"Edit story"}).click();
  const dialog=page.getByRole("dialog");await dialog.getByLabel("What happened").fill("A counselor's proposed revision to review.");
  await dialog.getByRole("button",{name:"Save changes"}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article",{name:storyTitle}).getByText("Hidden from family until the student confirms this version.")).toBeVisible();
 });
 test("family cannot read unconfirmed counselor revisions or their dependent narratives",async({page})=>{
  await signInAs(page,emails.parent1,`/family-interview/${student}?view=bank`);
  await expect(page.getByRole("article",{name:storyTitle})).toHaveCount(0);await expect(page.getByRole("article",{name:narrativeTitle})).toHaveCount(0);
  expect(await page.content()).not.toContain("A counselor's proposed revision to review.");
 });
 test("student reviews the changed story and its narrative before family sharing resumes",async({page})=>{
  await signInAs(page,emails.student,"/student-interview?view=bank");
  for(const [title,kind]of [[storyTitle,"story"],[narrativeTitle,"narrative"]]) {
   await page.getByRole("article",{name:title}).getByRole("button",{name:`Edit ${kind}`}).click();
   const dialog=page.getByRole("dialog");await dialog.getByLabel("Does this feel accurate?").selectOption("confirmed");
   await dialog.getByRole("button",{name:"Save changes"}).click();await expect(dialog).toHaveCount(0);
  }
 });
 test("student can withdraw family sharing and finish a revisitable review",async({page})=>{
  await signInAs(page,emails.student,"/student-interview?view=bank");
  await page.getByRole("article",{name:storyTitle}).getByRole("button",{name:"Edit story"}).click();
  const dialog=page.getByRole("dialog");await dialog.getByLabel("Who can see this item").selectOption("counselor");
  await dialog.getByRole("button",{name:"Save changes"}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:"Interview",exact:true}).click();await stage(page,3);
  await expect(page.getByText("Community and belonging\nCost and financial aid",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Finish my interview review"}).click();
  await expect.poll(async()=> (await db.from("student_interview_checkpoints").select("stage").eq("firm_id",firm).eq("student_id",student).eq("stage",3)).data?.length).toBe(1);
  expect((await db.from("student_story_sources").select("original_text").eq("firm_id",firm).eq("entry_id",storyId).single()).data?.original_text).toBe(memory);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
  await page.screenshot({path:"/tmp/counselworks-student-interview-mobile.png",fullPage:true});
 });
 test("withdrawing a story hides its narrative and original snapshot from family",async({page})=>{
  await signInAs(page,emails.parent1,`/family-interview/${student}?view=bank`);
  await expect(page.getByRole("article",{name:storyTitle})).toHaveCount(0);await expect(page.getByRole("article",{name:narrativeTitle})).toHaveCount(0);
  expect(await page.content()).not.toContain(memory);
 });
 test("counselor closes an answered follow-up and can use the interview on mobile",async({page})=>{
  await signInAs(page,env!.counselorEmail,`/students/${student}/interview`);
  const follow=page.locator("details").filter({has:page.locator("summary").filter({hasText:question})});
  await follow.locator("summary").click();await follow.getByRole("button",{name:"Close follow-up",exact:true}).click();
  await expect.poll(async()=> (await db.from("student_interview_followups").select("status").eq("firm_id",firm).eq("student_id",student).eq("question",question).single()).data?.status).toBe("closed");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
  await page.screenshot({path:"/tmp/counselworks-counselor-interview-mobile.png",fullPage:true});
 });
 test("counselor drafts a sourced strategy brief and permanently private working notes",async({page})=>{
  await signInAs(page,env!.counselorEmail,`/students/${student}/interview?view=strategy`);
  for(const [title,key,body,source]of [
   ["Priorities and direction","priorities","Community and affordability guide the student's college search.","· P1 ·"],
   ["Strengths and experiences","strengths","Patient, collaborative problem solving is worth exploring.",`Story · ${storyTitle}`],
   ["Student and parent perspectives","alignment",`Private planning synthesis ${suffix}`,"Parent One · R2"],
   ["Private counselor notes","counselor_notes",`Private working note ${suffix}`,""],
  ]){
   const card=page.getByRole("article",{name:title,exact:true});await card.getByRole("button",{name:"Start draft"}).click();
   const dialog=page.getByRole("dialog");await dialog.getByLabel("Counselor synthesis").fill(body);
   if(source){
    await dialog.getByText("Link interview responses, stories or narratives",{exact:true}).click();
    if(key==="alignment"){
     const original=await db.from("student_interview_answers").select("id").eq("firm_id",firm).eq("student_id",student).eq("respondent_user_id",parent1).eq("question_key","R2").single();expect(original.error).toBeNull();
     await dialog.locator(`input[name="source_key"][value="answer:${original.data!.id}"]`).check();
    }else await dialog.getByRole("checkbox",{name:new RegExp(source)}).check();
   }
   await dialog.getByRole("button",{name:"Save section",exact:true}).click();await expect(dialog).toHaveCount(0);
   await expect(card.getByText("Counselor-only draft",{exact:true})).toBeVisible();
   expect((await db.from("student_strategy_sections").select("publication_state").eq("firm_id",firm).eq("student_id",student).eq("section_key",key).single()).data?.publication_state).toBe("draft");
  }
 });
 test("student and both parents cannot read counselor strategy drafts",async({browser})=>{
  for(const [email,url]of [[emails.student,"/student-interview?view=strategy"],[emails.parent1,`/family-interview/${student}?view=strategy`],[emails.parent2,`/family-interview/${student}?view=strategy`]]){
   const context=await browser.newContext(),page=await context.newPage();
   await signInAs(page,email,url);
   await expect(page.getByText("No strategy sections have been shared with you yet.")).toBeVisible();
   expect(await page.content()).not.toContain(`Private planning synthesis ${suffix}`);
   expect(await page.content()).not.toContain(`Private working note ${suffix}`);await context.close();
  }
 });
 test("counselor explicitly shares student-ready sections and cannot publish private parent evidence",async({page})=>{
  await signInAs(page,env!.counselorEmail,`/students/${student}/interview?view=strategy`);
  for(const title of ["Priorities and direction","Strengths and experiences"]){
   await page.getByRole("article",{name:title,exact:true}).getByRole("button",{name:"Edit section"}).click();
   const dialog=page.getByRole("dialog");await dialog.getByLabel("Share this section with").selectOption("shared");
   await dialog.getByRole("button",{name:"Save section",exact:true}).click();await expect(dialog).toHaveCount(0);
  }
  await page.getByRole("article",{name:"Student and parent perspectives",exact:true}).getByRole("button",{name:"Edit section"}).click();
  const dialog=page.getByRole("dialog");await dialog.getByLabel("Share this section with").selectOption("shared");
  await dialog.getByRole("button",{name:"Save section",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("linked parent response is private");
  await expect(dialog.getByLabel("Counselor synthesis")).toHaveValue(`Private planning synthesis ${suffix}`);
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await dialog.getByRole("button",{name:"Discard edits",exact:true}).click();
  await page.getByRole("article",{name:"Private counselor notes",exact:true}).getByRole("button",{name:"Edit section"}).click();
  await expect(dialog.getByLabel("Share this section with")).toHaveCount(0);await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
 });
 test("student reviews without widening source permissions and can open interview and story evidence",async({page})=>{
  await signInAs(page,emails.student,"/student-interview?view=strategy");
  const priorities=page.getByRole("article",{name:"Priorities and direction",exact:true});
  await priorities.getByText("Review and parent sharing",{exact:true}).click();
  await priorities.getByLabel("Does this reflect your perspective?").selectOption("accurate");
  await expect(priorities.getByRole("checkbox")).toBeDisabled();
  await priorities.getByRole("button",{name:"Save my review",exact:true}).click();
  await expect(priorities.getByText(/Student review: Feels accurate/)).toBeVisible();
  await priorities.getByText("Supporting sources (1)",{exact:true}).click();
  await priorities.getByRole("button",{name:/· P1 ·/}).click();
  await expect(page.locator('details[data-question="P1"]')).toHaveAttribute("open","");
  await page.getByRole("button",{name:"Strategy brief",exact:true}).click();
  const strength=page.getByRole("article",{name:"Strengths and experiences",exact:true});
  await strength.getByText("Supporting sources (1)",{exact:true}).click();await strength.getByRole("button",{name:new RegExp(`Story · ${storyTitle}`)}).click();
  const story=page.getByRole("article",{name:storyTitle,exact:true});await expect(story).toBeFocused();
  await story.getByRole("button",{name:"Edit story",exact:true}).click();
  const dialog=page.getByRole("dialog");await dialog.getByLabel("Who can see this item").selectOption("family");
  await dialog.getByRole("button",{name:"Save changes",exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:"Strategy brief",exact:true}).click();
  await expect(strength.getByText(/Linked sources changed/)).toBeVisible();
 });
 test("counselor refreshes changed evidence and stale edits retain their text",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,`/students/${student}/interview?view=strategy`);
  const title="Strengths and experiences";
  await page.getByRole("article",{name:title,exact:true}).getByRole("button",{name:"Edit section"}).click();
  const context=await browser.newContext(),other=await context.newPage();
  await signInAs(other,env!.counselorEmail,`/students/${student}/interview?view=strategy`);
  await other.getByRole("article",{name:title,exact:true}).getByRole("button",{name:"Edit section"}).click();
  await other.getByLabel("Counselor synthesis").fill("An unsaved simultaneous strategy draft");
  await page.getByRole("dialog").getByRole("button",{name:"Save section",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
  await other.getByRole("dialog").getByRole("button",{name:"Save section",exact:true}).click();
  await expect(other.getByRole("dialog").getByRole("alert")).toContainText("changed in another window");await expect(other.getByLabel("Counselor synthesis")).toHaveValue("An unsaved simultaneous strategy draft");
  other.on("dialog",dialog=>dialog.accept());await context.close();
 });
 test("student approves parent sharing and the chosen review note travels with the section",async({page})=>{
  await signInAs(page,emails.student,"/student-interview?view=strategy");
  const strength=page.getByRole("article",{name:"Strengths and experiences",exact:true});
  await strength.getByText("Review and parent sharing",{exact:true}).click();
  await strength.getByLabel("Does this reflect your perspective?").selectOption("accurate");
  await strength.getByLabel("Your review note").fill("This captures what I wanted to say.");
  await expect(page.getByRole("button",{name:"Interview",exact:true})).toBeDisabled();
  await strength.getByRole("checkbox").check();await strength.getByRole("button",{name:"Save my review",exact:true}).click();
  await expect(strength.getByText("Student-approved · Shared with parents",{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
  await page.screenshot({path:"/tmp/counselworks-strategy-student-mobile.png",fullPage:true});
 });
 test("both parents see only approved sections and independently accessible evidence",async({browser})=>{
  for(const email of [emails.parent1,emails.parent2]){
   const context=await browser.newContext(),page=await context.newPage();
   await signInAs(page,email,`/family-interview/${student}?view=strategy`);
   const strength=page.getByRole("article",{name:"Strengths and experiences",exact:true});await expect(strength).toBeVisible();
   await expect(strength.getByText("This captures what I wanted to say.",{exact:true})).toBeVisible();
   await expect(page.getByRole("article",{name:"Priorities and direction",exact:true})).toHaveCount(0);
   await expect(page.getByRole("button",{name:"Edit section",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Save my review",exact:true})).toHaveCount(0);
   expect(await page.content()).not.toContain(memory);expect(await page.content()).not.toContain(`Private working note ${suffix}`);expect(await page.content()).not.toContain(`Private planning synthesis ${suffix}`);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
  await page.screenshot({path:"/tmp/counselworks-strategy-parent-mobile.png",fullPage:true});await context.close();
  }
 });
 test("counselor revisions preserve student feedback and require fresh parent consent",async({page})=>{
  await signInAs(page,env!.counselorEmail,`/students/${student}/interview?view=strategy`);
  const strength=page.getByRole("article",{name:"Strengths and experiences",exact:true});await strength.getByRole("button",{name:"Edit section"}).click();
  const dialog=page.getByRole("dialog");await dialog.getByLabel("Counselor synthesis").fill("A revised strategy to discuss together.");
  await dialog.getByRole("button",{name:"Save section",exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(strength.getByText("Earlier student feedback",{exact:true})).toBeVisible();await expect(strength.getByText("This captures what I wanted to say.",{exact:true})).toBeVisible();
  await page.screenshot({path:"/tmp/counselworks-strategy-counselor-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
  await page.screenshot({path:"/tmp/counselworks-strategy-counselor-mobile.png",fullPage:true});
 });
 test("parents cannot read revised brief sections before the student reviews again",async({page})=>{
  await signInAs(page,emails.parent1,`/family-interview/${student}?view=strategy`);
  await expect(page.getByRole("article")).toHaveCount(0);expect(await page.content()).not.toContain("A revised strategy to discuss together.");
 });
 test("student can request a correction, reapprove, and withdraw parent access",async({page,browser})=>{
  await signInAs(page,emails.student,"/student-interview?view=strategy");
  const strength=page.getByRole("article",{name:"Strengths and experiences",exact:true});
  await strength.getByText("Review and parent sharing",{exact:true}).click();await strength.getByLabel("Does this reflect your perspective?").selectOption("discuss");
  await strength.getByLabel("Your review note").fill("Let's discuss the emphasis.");await strength.getByRole("button",{name:"Save my review",exact:true}).click();
  await expect(strength.getByText(/Student review: Discussion requested/)).toBeVisible();
  await strength.getByText("Review and parent sharing",{exact:true}).click();await strength.getByLabel("Does this reflect your perspective?").selectOption("accurate");
  await strength.getByRole("checkbox").check();await strength.getByRole("button",{name:"Save my review",exact:true}).click();
  const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,emails.parent2,`/family-interview/${student}?view=strategy`);
  await expect(parent.getByRole("article",{name:"Strengths and experiences",exact:true})).toBeVisible();
  await strength.getByText("Review and parent sharing",{exact:true}).click();await strength.getByRole("checkbox").uncheck();await strength.getByRole("button",{name:"Save my review",exact:true}).click();
  await parent.reload();await expect(parent.getByRole("article")).toHaveCount(0);await context.close();
 });
});

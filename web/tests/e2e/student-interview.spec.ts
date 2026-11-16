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
 const suffix=process.env.E2E_INTERVIEW_SUFFIX || randomUUID().slice(0,8);
 const emails={student:`e2e-student-interview-${suffix}+clerk_test@example.com`,parent1:`e2e-parent1-interview-${suffix}+clerk_test@example.com`,parent2:`e2e-parent2-interview-${suffix}+clerk_test@example.com`};
 const memory=`A chipped blue mug from our Saturday repair project ${suffix}`,privateParent=`Private family planning context ${suffix}`,storyTitle=`Repairing things together ${suffix}`,narrativeTitle=`Patient problem solving ${suffix}`,question=`What did you do when the first repair failed? ${suffix}`;
 let db:SupabaseClient,storyId:string;
 const followCollege=randomUUID(),followSchool=randomUUID(),followApp=randomUUID(),followDocument=randomUUID(),followToday=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 let followMaterial="",followReceipt="",followParentTask="";
 const decisionCollege=randomUUID(),decisionSchool=randomUUID(),decisionApp=randomUUID(),decisionDocument=randomUUID();
 let decisionStep="",decisionLetter="",decisionTask="";
 const decisionPath=(surface="applications")=>`/${surface}/${decisionApp}/decisions`;
 const catalog=randomUUID(),unknownCatalog=randomUUID(),promptSet=randomUUID(),wrongYearSet=randomUUID(),finalCatalog=randomUUID();
 const planningPrompts=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()];
 const planningStory=randomUUID(),planningNarrative=randomUUID(),planningPrivate=randomUUID();
 const unrelatedFamily=randomUUID(),unrelatedStudent=randomUUID(),unrelatedEssay=randomUUID();
 const draftingEssay=randomUUID(),draftingStory=randomUUID(),draftingNarrative=randomUUID();
 const draftingTitle=`Drafting essay ${suffix}`,draftingStoryTitle=`A real workshop result ${suffix}`,draftingNarrativeTitle=`Making space for another approach ${suffix}`;
 const outlinePurpose=`Show a habit of testing ideas together ${suffix}`,oldDraft=`Private discarded opening ${suffix}`,firstDraft=`I invited my teammate to test a different design. We learned from both experiments. ${suffix}`,revisedDraft=`Together we tested two designs and helped three new teammates build their own. ${suffix}`;
 const coachComment=`Explain what changed for your teammate ${suffix}`,revisionTitle=`Revise the workshop impact ${suffix}`;
 let draftingFeedback="",draftingTask="";
 const planningCollege=`Planning College ${suffix}`,planningStoryTitle=`A shared design workshop ${suffix}`,planningNarrativeTitle=`Learning through experiments ${suffix}`,planningPrivateTitle=`Private planning experience ${suffix}`;
 const planAngle=`Show how I made room for a teammate's idea ${suffix}`,revisedAngle=`A revised angle for discussion ${suffix}`,writing=`I invited my teammate to sketch a different design. We tested both ideas together. ${suffix}`;
 let planningDrafts:string[]=[];
 const board=()=>`/students/${student}/essays/planning`;
 const planCard=(page:Page,index:number)=>page.locator(`#planning-${planningDrafts[index]}`);
 async function editPlan(page:Page,index:number){await planCard(page,index).getByRole("button",{name:/^(Plan response|Edit plan)$/}).click();return page.getByRole("dialog");}
 async function savePlan(page:Page){const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Save plan",exact:true}).click();await expect(dialog).toHaveCount(0);}
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
  await done(await db.from("tasks").delete().eq("firm_id",firm).eq("student_id",student));
  for(const table of ["application_next_steps","application_follow_through_items","student_essay_outlines","student_essay_plans","student_strategy_sections","student_story_essay_links","student_interview_followups","student_story_bank","student_interview_checkpoints","student_interview_answers"])await done(await db.from(table).delete().eq("firm_id",firm).eq("student_id",student));
  const owned=await db.from("essay_drafts").select("id").eq("firm_id",firm).eq("student_id",student);expect(owned.error).toBeNull();
  if(owned.data?.length){await done(await db.from("essay_feedback").delete().eq("firm_id",firm).in("essay_draft_id",owned.data.map(e=>e.id)));await done(await db.from("essay_drafts").update({submitted_version_id:null}).eq("firm_id",firm).eq("student_id",student));await done(await db.from("essay_draft_versions").delete().in("essay_draft_id",owned.data.map(e=>e.id)));}
  await done(await db.from("essay_drafts").delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("documents").delete().eq("firm_id",firm).in("id",[followDocument,decisionDocument]));
  await done(await db.from("applications").delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("student_colleges").delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("college_library_prompts").delete().in("prompt_set_id",[promptSet,wrongYearSet]));
  await done(await db.from("college_prompt_sets").delete().in("id",[promptSet,wrongYearSet]));
  await done(await db.from("colleges").delete().in("id",[catalog,unknownCatalog,finalCatalog,followCollege,decisionCollege]));
  await done(await db.from("student_staff_assignments").delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("student_profiles").delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("students").delete().eq("firm_id",firm).eq("id",student));
  await done(await db.from("family_members").delete().eq("firm_id",firm).eq("family_id",family));
  await done(await db.from("families").delete().eq("firm_id",firm).eq("id",family));
  await done(await db.from("firm_memberships").delete().eq("firm_id",firm).in("user_id",[studentUser,parent1,parent2]));
  await done(await db.from("users").delete().in("id",[studentUser,parent1,parent2]));
  await done(await db.from("essay_drafts").delete().eq("firm_id",firm).eq("id",unrelatedEssay));
  await done(await db.from("students").delete().eq("firm_id",firm).eq("id",unrelatedStudent));
  await done(await db.from("families").delete().eq("firm_id",firm).eq("id",unrelatedFamily));
 });
 test("final application review: exact versions, consent, clean packet and student submission",async({page,browser})=>{
  test.setTimeout(180_000);
  const app=randomUUID(),school=randomUUID(),response=randomUUID(),title=`Final response ${suffix}`,body=`A particular contribution I made with my teammates. ${suffix}`;
  await done(await db.from("colleges").insert({id:finalCatalog,name:`Final Review College ${suffix}`,slug:`final-review-${suffix}`}));
  await done(await db.from("student_colleges").insert({id:school,firm_id:firm,student_id:student,college_id:finalCatalog,category:"target",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("applications").insert({id:app,firm_id:firm,student_id:student,student_college_id:school,college_id:finalCatalog,application_type:"rd",stage:"in_progress",deadline_source:"explicit",checklist_json:[{key:"portal",label:"Portal requirements checked",done:true}],created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("essay_drafts").insert({id:response,firm_id:firm,student_id:student,application_id:app,essay_type:"supplemental",title,body,prompt_text:"Describe your contribution.",word_count_limit:150,visibility_scope:"family",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("essay_draft_versions").insert({essay_draft_id:response,version_number:1,body,commentary:"PRIVATE VERSION COMMENTARY",created_by_user_id:counselor}));
  const staffPath=`/applications/${app}/review`,studentPath=`/student-applications/${app}/review`,familyPath=`/family-applications/${app}/review`;
  const studentContext=await browser.newContext(),parentContext=await browser.newContext(),secondParentContext=await browser.newContext();
  const portal=await studentContext.newPage(),parent=await parentContext.newPage(),otherParent=await secondParentContext.newPage();
  try {
   await signInAs(page,env!.counselorEmail,staffPath);
   await expect(page.getByRole("heading",{name:"Final application review",exact:true})).toBeVisible();
   await page.getByRole("button",{name:"Prepare review packet",exact:true}).click();
   await expect(page.getByRole("heading",{name:/2. Approve the saved packet/})).toBeVisible();
   const first=(await db.from("application_review_packets").select("id,revision").eq("firm_id",firm).eq("application_id",app).single()).data!;
   await signInAs(parent,emails.parent1,familyPath);await expect(parent.getByText("No submission packet is currently shared with you.")).toBeVisible();expect(await parent.content()).not.toContain(body);
   expect((await parent.request.get(`/api/application-packets/${first.id}?application=${app}`)).status()).toBe(404);
   await signInAs(portal,emails.student,studentPath);
   await portal.getByRole("checkbox",{name:/I reviewed these exact saved responses/}).check();await portal.getByRole("button",{name:"Approve as student",exact:true}).click();
   await expect(portal.getByRole("button",{name:"Share approved packet with parents",exact:true})).toBeVisible();
   // The counselor's already-open page has an old packet revision, even though the text matches.
   await page.getByRole("checkbox",{name:/I reviewed these exact saved responses/}).check();await page.getByRole("button",{name:"Approve as counselor",exact:true}).click();
   await expect(page.getByRole("alert").filter({hasText:"changed in another window"})).toBeVisible();
   await page.getByRole("button",{name:"Refresh review checks",exact:true}).click();
   await expect(page.getByRole("checkbox",{name:/I reviewed these exact saved responses/})).not.toBeChecked();
   await page.getByRole("checkbox",{name:/I reviewed these exact saved responses/}).check();await page.getByRole("button",{name:"Approve as counselor",exact:true}).click();
   await expect(page.getByRole("link",{name:/Download clean submission packet/})).toBeVisible();
   await portal.getByRole("button",{name:"Refresh review checks",exact:true}).click();
   await portal.getByRole("button",{name:"Share approved packet with parents",exact:true}).click();await expect(portal.getByRole("button",{name:/Stop sharing packet/})).toBeVisible();
   await parent.reload();await expect(parent.getByText(body,{exact:true})).toBeVisible();expect(await parent.content()).not.toContain("PRIVATE VERSION COMMENTARY");
   await signInAs(otherParent,emails.parent2,familyPath);await expect(otherParent.getByText(body,{exact:true})).toBeVisible();
   const download=await parent.request.get(`/api/application-packets/${first.id}?application=${app}`);expect(download.status()).toBe(200);expect(download.headers()["cache-control"]).toContain("no-store");expect(await download.text()).toContain(body);expect(await download.text()).not.toMatch(/PRIVATE VERSION COMMENTARY|feedback|original_text/);
   // Autosave invalidates approvals without changing the saved version.
   await done(await db.rpc("write_essay",{p_firm:firm,p_actor:counselor,p_essay:response,p_action:"autosave",p_body:`${body} A new working sentence.`}));
   await page.reload();await expect(page.getByText(/Outdated packet\./)).toBeVisible();await expect(page.getByText(/save the current writing as a version/)).toBeVisible();
   await parent.reload();expect(await parent.content()).not.toContain(body);expect((await parent.request.get(`/api/application-packets/${first.id}?application=${app}`)).status()).toBe(404);
   await done(await db.rpc("write_essay",{p_firm:firm,p_actor:counselor,p_essay:response,p_action:"save",p_body:`${body} A revised ending.`}));
   await page.reload();await page.getByRole("button",{name:"Prepare updated packet",exact:true}).click();
   await expect(page.getByRole("heading",{name:/2. Approve the saved packet.*Packet 2/})).toBeVisible();
   await page.getByRole("checkbox",{name:/I reviewed these exact saved responses/}).check();await page.getByRole("button",{name:"Approve as counselor",exact:true}).click();
   await expect(page.getByRole("button",{name:"Withdraw my approval",exact:true})).toBeVisible();
   await portal.reload();await portal.getByRole("checkbox",{name:/I reviewed these exact saved responses/}).check();await portal.getByRole("button",{name:"Approve as student",exact:true}).click();
   await expect(portal.getByRole("button",{name:"Record my submission",exact:true})).toBeVisible();
   await portal.getByRole("button",{name:"Share approved packet with parents",exact:true}).click();await expect(portal.getByRole("button",{name:/Stop sharing packet/})).toBeVisible();
   const latest=(await db.from("application_review_packets").select("id").eq("firm_id",firm).eq("application_id",app).eq("number",2).single()).data!;
   await portal.getByLabel("Confirmation reference (optional)").fill(`CONFIRMED-${suffix}`);
   await portal.getByRole("checkbox",{name:/I submitted this packet/}).check();await portal.getByRole("button",{name:"Record my submission",exact:true}).click();
   await expect(portal.getByText(/Student recorded submission on/)).toBeVisible();
   expect((await db.from("applications").select("stage").eq("firm_id",firm).eq("id",app).single()).data?.stage).toBe("submitted");
   expect((await db.from("application_review_packets").select("manifest,student_approved_at,counselor_approved_at").eq("firm_id",firm).eq("id",first.id).single()).data?.manifest.essays[0].body).toBe(body);
   await parent.reload();await expect(parent.getByText(`Confirmation reference: CONFIRMED-${suffix}`)).toBeVisible();
   for(const p of [page,portal,parent]) {
    await p.setViewportSize({width:390,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    expect((await new AxeBuilder({page:p}).include("main").analyze()).violations).toEqual([]);
    await p.screenshot({path:`/tmp/counselworks-final-review-${p===page?"counselor":p===portal?"student":"parent"}.png`,fullPage:true});
   }
   // Revoking the underlying essay audience also revokes the packet/download.
   await done(await db.from("essay_drafts").update({visibility_scope:"student"}).eq("firm_id",firm).eq("id",response));
   await parent.reload();expect(await parent.content()).not.toContain(`${body} A revised ending.`);
   expect((await otherParent.request.get(`/api/application-packets/${latest.id}?application=${app}`)).status()).toBe(404);
   await done(await db.from("essay_drafts").update({visibility_scope:"family"}).eq("firm_id",firm).eq("id",response));
   await portal.reload();await portal.getByRole("button",{name:/Stop sharing packet/}).click();await expect(portal.getByRole("button",{name:"Share approved packet with parents",exact:true})).toBeVisible();
   await parent.reload();expect(await parent.content()).not.toContain(`${body} A revised ending.`);
   // Assignment withdrawal is enforced on pages and direct export URLs.
   await done(await db.from("student_staff_assignments").delete().eq("firm_id",firm).eq("student_id",student).eq("user_id",counselor));
   await page.goto(staffPath);await expect(page.getByRole("heading",{name:"Final application review",exact:true})).toHaveCount(0);
   expect((await page.request.get(`/api/application-packets/${latest.id}?application=${app}`)).status()).toBe(404);
   await done(await db.from("student_staff_assignments").insert({firm_id:firm,student_id:student,user_id:counselor,assignment_type:"counselor"}));
  } finally {
   await studentContext.close();await parentContext.close();await secondParentContext.close();
   await done(await db.from("essay_draft_versions").delete().eq("essay_draft_id",response));
   await done(await db.from("essay_drafts").delete().eq("firm_id",firm).eq("id",response));
   await done(await db.from("applications").delete().eq("firm_id",firm).eq("id",app));
   await done(await db.from("student_colleges").delete().eq("firm_id",firm).eq("id",school));
   await done(await db.from("colleges").delete().eq("id",finalCatalog));
  }
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
  await page.goto(`/student-essays/${essay}`);await expect(page.getByRole("region",{name:"Stories and narratives connected to this essay"}).getByText(storyTitle,{exact:true})).toBeVisible();
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
  await expect(strength.getByText("Student-approved · Shared with parents",{exact:true})).toBeVisible();
  const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,emails.parent2,`/family-interview/${student}?view=strategy`);
  await expect(parent.getByRole("article",{name:"Strengths and experiences",exact:true})).toBeVisible();
  await strength.getByText("Review and parent sharing",{exact:true}).click();await strength.getByRole("checkbox").uncheck();await strength.getByRole("button",{name:"Save my review",exact:true}).click();
  // A second persona must read after the student's consent change commits.
  await expect(strength.getByText("Shared with student · Parents cannot see this section",{exact:true})).toBeVisible();
  await parent.reload();await expect(parent.getByRole("article")).toHaveCount(0);await context.close();
 });
 test("planning board: counselor assigns current required and optional responses without inventing coverage",async({page})=>{
  const scorecard=1_000_000+Math.floor(Math.random()*1_000_000);
  await done(await db.from("colleges").insert([{id:catalog,name:planningCollege,slug:`planning-${suffix}`,scorecard_id:scorecard},{id:unknownCatalog,name:`Unverified College ${suffix}`,slug:`planning-unknown-${suffix}`,scorecard_id:scorecard+1}]));
  await done(await db.from("college_prompt_sets").insert([{id:promptSet,scorecard_id:scorecard,college_name:planningCollege,entry_year:2027,coverage:"verified",source_url:"https://example.edu/admissions",verified_on:"2026-11-12"},{id:wrongYearSet,scorecard_id:scorecard+1,college_name:`Unverified College ${suffix}`,entry_year:2028,coverage:"verified",source_url:"https://example.edu/admissions",verified_on:"2026-11-12"}]));
  const prompt=(i:number,title:string,requirement:string)=>({id:planningPrompts[i],prompt_set_id:promptSet,prompt_key:`plan-${i}`,title,prompt_text:`Describe ${title.toLowerCase()}.`,word_limit:250,requirement,sort_order:i});
  await done(await db.from("college_library_prompts").insert([prompt(0,"Team contribution","required"),prompt(1,"A meaningful experience","required"),prompt(3,"Optional perspective","optional"),prompt(4,"Program response","conditional"),{id:randomUUID(),prompt_set_id:wrongYearSet,prompt_key:"wrong-year",title:`Future-only question ${suffix}`,prompt_text:"A question for next year.",word_limit:100,requirement:"required",sort_order:0}]));
  const list=await db.from("student_colleges").insert([{firm_id:firm,student_id:student,college_id:catalog,category:"target",created_by_user_id:counselor,updated_by_user_id:counselor},{firm_id:firm,student_id:student,college_id:unknownCatalog,category:"target",created_by_user_id:counselor,updated_by_user_id:counselor}]).select("id,college_id");expect(list.error).toBeNull();
  await done(await db.from("applications").insert({firm_id:firm,student_id:student,college_id:catalog,student_college_id:list.data!.find(l=>l.college_id===catalog)!.id,application_type:"rd",deadline_at:"2027-01-01T00:00:00Z",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("college_library_prompts").insert(prompt(2,"Academic fit","required")));
  await done(await db.from("student_story_bank").insert([{id:planningStory,firm_id:firm,student_id:student,kind:"story",story_ids:[],title:planningStoryTitle,body:"At a design workshop I invited another approach and tested it together.",audience:"family",review_state:"confirmed",created_by_user_id:studentUser},{id:planningNarrative,firm_id:firm,student_id:student,kind:"narrative",title:planningNarrativeTitle,body:"I learn by making room for experiments and other perspectives.",story_ids:[planningStory],audience:"family",review_state:"confirmed",created_by_user_id:studentUser},{id:planningPrivate,firm_id:firm,student_id:student,kind:"story",story_ids:[],title:planningPrivateTitle,body:`A private experience that parents must not see ${suffix}`,audience:"counselor",review_state:"confirmed",created_by_user_id:studentUser}]));
  await done(await db.from("student_story_essay_links").insert({firm_id:firm,student_id:student,entry_id:planningStory,essay_id:essay,created_by_user_id:counselor}));
  await signInAs(page,env!.counselorEmail,board());
  await expect(page.getByText(/Requirements need verification for Fall 2027/)).toBeVisible();await expect(page.getByRole("article",{name:`Future-only question ${suffix}`})).toHaveCount(0);
  const missing=page.getByRole("article",{name:"Academic fit",exact:true});await expect(missing).toContainText("Required response not assigned");
  await missing.getByRole("button",{name:"Assign required response",exact:true}).click();await expect(page.getByRole("article").filter({hasText:"Academic fit"}).getByRole("button",{name:"Plan response",exact:true})).toBeVisible();
  await page.getByRole("article",{name:"Optional perspective",exact:true}).getByRole("button",{name:"Assign optional response",exact:true}).click();
  await expect(page.getByRole("article").filter({hasText:"Optional perspective"}).getByRole("button",{name:"Plan response",exact:true})).toBeVisible();
  const drafts=await db.from("essay_drafts").select("id,library_prompt_id").eq("firm_id",firm).eq("student_id",student).in("library_prompt_id",planningPrompts);expect(drafts.error).toBeNull();
  planningDrafts=planningPrompts.slice(0,4).map(id=>drafts.data!.find(e=>e.library_prompt_id===id)!.id);expect(drafts.data).toHaveLength(4);
  await expect(page.getByRole("article",{name:"Program response",exact:true})).toContainText("Optional or conditional");
 });
 test("planning board: counselor connects stories and narratives and sees deduplicated same-college overlap",async({page})=>{
  await signInAs(page,env!.counselorEmail,board());
  for(const i of [0,1,2]){const dialog=await editPlan(page,i);await dialog.getByLabel("Response approach").selectOption(i===2?"research":"experience");await dialog.getByLabel("What will this response show?").fill(i===0?planAngle:i===1?`Explore the workshop from another perspective ${suffix}`:`Connect the curriculum to my interests ${suffix}`);if(i!==2)await dialog.locator(`input[name="entry_id"][value="${planningStory}"]`).check();if(i===0)await dialog.locator(`input[name="entry_id"][value="${planningNarrative}"]`).check();await savePlan(page);}
  for(const i of [0,1])await expect(planCard(page,i)).toContainText(`Story overlap in this college: ${planningStoryTitle}`);
  await expect(page.locator("details").filter({has:page.locator("summary").filter({hasText:planningStoryTitle})}).locator("summary")).toContainText("3 visible essays");
  await expect(planCard(page,2)).toContainText("A personal story is optional");await expect(planCard(page,2)).not.toContainText("Connect a story or narrative");
  await page.screenshot({path:"/tmp/counselworks-planning-counselor-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);await page.screenshot({path:"/tmp/counselworks-planning-counselor-mobile.png",fullPage:true});
 });
 test("planning board: student reviews experience and research plans and writes in the connected essay",async({page})=>{
  await signInAs(page,emails.student,"/student-essays/planning");
  for(const i of [0,2]){const dialog=await editPlan(page,i);await dialog.getByLabel("Plan review",{exact:true}).selectOption("confirmed");await expect(dialog.getByRole("checkbox",{name:"Allow my parents or guardians to see this plan note and approach."})).toBeDisabled();await savePlan(page);await expect(planCard(page,i)).toContainText("Plan reviewed");}
  await planCard(page,0).getByRole("link",{name:"Open essay",exact:true}).click();await page.getByPlaceholder("Start writing...").fill(writing);await page.getByRole("button",{name:"Save Draft",exact:true}).click();await expect(page.getByRole("button",{name:"Saved",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Open essay planning board",exact:true}).click();await expect(planCard(page,0)).toContainText("v2");await expect(planCard(page,0)).toContainText("Plan reviewed");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);await page.screenshot({path:"/tmp/counselworks-planning-student-mobile.png",fullPage:true});
 });
 test("planning board: essay sharing keeps plan notes private and both parents see only visible reuse",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,`/essays/${planningDrafts[0]}`);
  for(const i of [0,1]){await page.goto(`/essays/${planningDrafts[i]}`);await page.locator("#essay-visibility").selectOption("family");await expect.poll(async()=>(await db.from("essay_drafts").select("visibility_scope").eq("firm_id",firm).eq("id",planningDrafts[i]).single()).data?.visibility_scope).toBe("family");}
  for(const email of [emails.parent1,emails.parent2]){const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,email,`/family-essay-planning/${student}`);await expect(planCard(parent,0)).toContainText("No planning note has been shared");await expect(planCard(parent,1)).toContainText("No planning note has been shared");expect(await parent.content()).not.toContain(planAngle);expect(await parent.content()).not.toContain(planningPrivateTitle);expect(await parent.content()).not.toContain(`Interview essay ${suffix}`);expect(await parent.content()).not.toContain(memory);await expect(parent.getByRole("button",{name:/^(Edit plan|Plan response)$/})).toHaveCount(0);await expect(parent.locator("details").filter({has:parent.locator("summary").filter({hasText:planningStoryTitle})}).locator("summary")).toContainText("2 visible essays");await parent.setViewportSize({width:390,height:844});expect(await parent.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page:parent}).include("main").analyze()).violations).toEqual([]);await parent.screenshot({path:"/tmp/counselworks-planning-parent-mobile.png",fullPage:true});await context.close();}
 });
 test("planning board: student approves parent notes and counselor revisions pause sharing while preserving writing",async({page,browser})=>{
  await signInAs(page,emails.student,"/student-essays/planning");const dialog=await editPlan(page,0);await dialog.getByLabel("Plan review",{exact:true}).selectOption("confirmed");await dialog.getByRole("checkbox",{name:"Allow my parents or guardians to see this plan note and approach."}).check();await savePlan(page);
  const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,emails.parent1,`/family-essay-planning/${student}`);await expect(planCard(parent,0)).toContainText(planAngle);await expect(planCard(parent,1)).toContainText("No planning note has been shared");
  const consent=await editPlan(page,0);await consent.getByRole("checkbox",{name:"Allow my parents or guardians to see this plan note and approach."}).uncheck();await savePlan(page);await parent.reload();expect(await parent.content()).not.toContain(planAngle);
  const approve=await editPlan(page,0);await approve.getByRole("checkbox",{name:"Allow my parents or guardians to see this plan note and approach."}).check();await savePlan(page);await parent.reload();await expect(planCard(parent,0)).toContainText(planAngle);
  const staffContext=await browser.newContext(),staff=await staffContext.newPage();await signInAs(staff,env!.counselorEmail,board());const edit=await editPlan(staff,0);await edit.getByLabel("What will this response show?").fill(revisedAngle);await savePlan(staff);await parent.reload();expect(await parent.content()).not.toContain(planAngle);expect(await parent.content()).not.toContain(revisedAngle);await expect(planCard(parent,0)).toContainText(planningNarrativeTitle);
  const draft=await db.from("essay_drafts").select("body,current_version_number,word_count_limit").eq("firm_id",firm).eq("id",planningDrafts[0]).single();expect(draft.data).toMatchObject({body:writing,current_version_number:2,word_count_limit:250});await staffContext.close();await context.close();
 });
 test("planning board: narrative-only connections still reveal reuse of the underlying story",async({page})=>{
  await signInAs(page,env!.counselorEmail,board());const dialog=await editPlan(page,0);await dialog.locator(`input[name="entry_id"][value="${planningStory}"]`).uncheck();await savePlan(page);await expect(planCard(page,0)).toContainText(`Story overlap in this college: ${planningStoryTitle}`);await expect(planCard(page,0).getByRole("link",{name:planningStoryTitle,exact:true})).toHaveCount(0);await expect(planCard(page,0).getByRole("link",{name:planningNarrativeTitle,exact:true})).toBeVisible();await expect(page.locator("details").filter({has:page.locator("summary").filter({hasText:planningStoryTitle})}).locator("summary")).toContainText("3 visible essays");
 });
 test("planning board: adding a private connection in the story bank revokes old parent note approval",async({page,browser})=>{
  await signInAs(page,emails.student,"/student-essays/planning");const dialog=await editPlan(page,0);await dialog.getByLabel("Plan review",{exact:true}).selectOption("confirmed");await dialog.getByRole("checkbox",{name:"Allow my parents or guardians to see this plan note and approach."}).check();await savePlan(page);
  await page.getByRole("link",{name:"Story and narrative bank",exact:true}).click();const privateEntry=page.locator(`#interview-bank-${planningPrivate}`);await privateEntry.getByLabel("Essay to connect").selectOption(planningDrafts[0]);await privateEntry.getByRole("button",{name:"Link to essay",exact:true}).click();await expect(privateEntry.getByRole("button",{name:"Unlink",exact:true})).toBeVisible();
  await page.goto("/student-essays/planning");await expect(planCard(page,0)).toContainText("Connected material changed");await expect(planCard(page,0)).toContainText(planningPrivateTitle);
  const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,emails.parent2,`/family-essay-planning/${student}`);expect(await parent.content()).not.toContain(planningPrivateTitle);expect(await parent.content()).not.toContain(planningPrivate);expect(await parent.content()).not.toContain(revisedAngle);await expect(planCard(parent,0)).toContainText("No planning note has been shared");await context.close();
 });
 test("planning board: stale saves retain the later writer's angle and selection",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,board());await editPlan(page,1);const context=await browser.newContext(),other=await context.newPage();await signInAs(other,env!.counselorEmail,board());const stale=await editPlan(other,1);await stale.getByLabel("What will this response show?").fill("A simultaneous unsaved angle");await page.getByRole("dialog").getByLabel("What will this response show?").fill("The first committed angle");await savePlan(page);await stale.getByRole("button",{name:"Save plan",exact:true}).click();await expect(stale.getByRole("alert")).toContainText("changed in another window");await expect(stale.getByLabel("What will this response show?")).toHaveValue("A simultaneous unsaved angle");await expect(stale.locator(`input[name="entry_id"][value="${planningStory}"]`)).toBeChecked();await stale.getByRole("button",{name:"Cancel",exact:true}).click();await expect(stale.getByText("Your edits have not been saved.",{exact:true})).toBeVisible();await stale.getByRole("button",{name:"Discard edits",exact:true}).click();await expect(other.getByRole("dialog")).toHaveCount(0);await context.close();
 });
 test("planning board: a source changed behind an open editor cannot be approved unseen",async({page})=>{
  await signInAs(page,emails.student,"/student-essays/planning");const dialog=await editPlan(page,1);await dialog.getByLabel("What will this response show?").fill("My review before the source changed");await dialog.getByLabel("Plan review",{exact:true}).selectOption("confirmed");
  await done(await db.from("student_story_bank").update({body:"A revised workshop account the open editor has not displayed.",revision:2}).eq("firm_id",firm).eq("student_id",student).eq("id",planningStory));
  await dialog.getByRole("button",{name:"Save plan",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("changed in another window");await expect(dialog.getByLabel("What will this response show?")).toHaveValue("My review before the source changed");await expect(dialog.locator(`input[name="entry_id"][value="${planningStory}"]`)).toBeChecked();
  expect((await db.from("student_essay_plans").select("angle").eq("firm_id",firm).eq("essay_id",planningDrafts[1]).single()).data?.angle).toBe("The first committed angle");await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await dialog.getByRole("button",{name:"Discard edits",exact:true}).click();
 });
 test("planning board: direct links deny unrelated households, other students and unassigned staff",async({browser})=>{
  await done(await db.from("families").insert({id:unrelatedFamily,firm_id:firm,household_name:`Unrelated planning family ${suffix}`,created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("students").insert({id:unrelatedStudent,firm_id:firm,family_id:unrelatedFamily,first_name:"Unrelated",last_name:`Planning ${suffix}`,graduation_year:2027,created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("essay_drafts").insert({id:unrelatedEssay,firm_id:firm,student_id:unrelatedStudent,essay_type:"supplemental",title:`Unrelated shared essay ${suffix}`,body:"Other household writing",visibility_scope:"family",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("student_essay_plans").insert({essay_id:unrelatedEssay,firm_id:firm,student_id:unrelatedStudent,approach:"research",angle:`Other household approved plan ${suffix}`,source_versions:[],review_state:"confirmed",family_shared:true,created_by_user_id:counselor,updated_by_user_id:counselor}));
  for(const [email,path]of [[emails.parent1,`/family-essay-planning/${unrelatedStudent}`],[emails.student,`/family-essay-planning/${unrelatedStudent}`],[env!.counselorEmail,`/students/${unrelatedStudent}/essays/planning`]]){const context=await browser.newContext(),page=await context.newPage();await signInAs(page,email,path);expect(await page.content()).not.toContain(`Unrelated shared essay ${suffix}`);expect(await page.content()).not.toContain(`Other household approved plan ${suffix}`);await expect(page.getByRole("heading",{name:"Essay planning board",exact:true})).toHaveCount(0);await expect(page.locator(`#planning-${unrelatedEssay}`)).toHaveCount(0);await context.close();}
 });
 test("readiness dashboard: roles see linked work without exposing private essays or tasks",async({browser})=>{
  const college=randomUUID(),listId=randomUUID(),appId=randomUUID(),setId=randomUUID(),promptId=randomUUID(),sharedEssay=randomUUID(),privateEssay=randomUUID(),studentEssay=randomUUID(),generalEssay=randomUUID(),sharedTask=randomUUID(),privateTask=randomUUID(),workflow=randomUUID(),step=randomUUID(),workflowTask=randomUUID();
  const name=`Readiness College ${suffix}`,shared=`Shared readiness essay ${suffix}`,privateTitle=`Staff private readiness essay ${suffix}`,studentTitle=`Student private readiness essay ${suffix}`,generalTitle=`General readiness essay ${suffix}`,required=`Required readiness prompt ${suffix}`,sharedTaskTitle=`Shared readiness task ${suffix}`,privateTaskTitle=`Student readiness task ${suffix}`,workflowTaskTitle=`College workflow task ${suffix}`;
  const scorecard=4_000_000+Math.floor(Math.random()*100_000);
  try {
   await done(await db.from("colleges").insert({id:college,name,slug:`readiness-${suffix}`,scorecard_id:scorecard}));
   await done(await db.from("student_colleges").insert({id:listId,firm_id:firm,student_id:student,college_id:college,category:"target",created_by_user_id:counselor,updated_by_user_id:counselor}));
   await done(await db.from("applications").insert({id:appId,firm_id:firm,student_id:student,college_id:college,student_college_id:listId,application_type:"rd",stage:"in_progress",deadline_at:"2027-01-15T00:00:00Z",checklist_json:[{key:"transcript",label:"Send transcript",done:false},{key:"form",label:"Application form",done:true}],created_by_user_id:counselor,updated_by_user_id:counselor}));
   await done(await db.from("college_prompt_sets").insert({id:setId,scorecard_id:scorecard,college_name:name,entry_year:2027,coverage:"verified",source_url:"https://example.edu/admissions",verified_on:"2026-11-12"}));
   await done(await db.from("college_library_prompts").insert({id:promptId,prompt_set_id:setId,prompt_key:"readiness-required",title:required,prompt_text:"Describe your contribution.",word_limit:250,requirement:"required",sort_order:1}));
   await done(await db.from("essay_drafts").insert([{id:sharedEssay,title:shared,visibility_scope:"family"},{id:privateEssay,title:privateTitle,visibility_scope:"staff"},{id:studentEssay,title:studentTitle,visibility_scope:"student"}].map(e=>({...e,firm_id:firm,student_id:student,student_college_id:listId,application_id:appId,essay_type:"supplemental",body:"A preserved draft.",created_by_user_id:counselor,updated_by_user_id:counselor}))));
   await done(await db.from("essay_drafts").insert({id:generalEssay,title:generalTitle,visibility_scope:"student",firm_id:firm,student_id:student,essay_type:"personal_statement",body:"A general draft.",created_by_user_id:counselor,updated_by_user_id:counselor}));
   await done(await db.from("tasks").insert([{id:sharedTask,title:sharedTaskTitle,visibility_scope:"family",assigned_user_id:parent1,owner_role:"parent"},{id:privateTask,title:privateTaskTitle,visibility_scope:"student",assigned_user_id:studentUser,owner_role:"student"}].map(t=>({...t,firm_id:firm,student_id:student,application_id:appId,task_type:"follow_up",status:"pending",created_by_user_id:counselor,updated_by_user_id:counselor}))));
   const templateStep=await db.from("workflow_template_steps").select("id").limit(1).single();expect(templateStep.error).toBeNull();
   await done(await db.from("student_workflows").insert({id:workflow,firm_id:firm,student_id:student,student_college_id:listId,name:`Readiness workflow ${suffix}`,status:"in_progress",created_by_user_id:counselor}));
   await done(await db.from("student_workflow_steps").insert({id:step,student_workflow_id:workflow,template_step_id:templateStep.data!.id,title:workflowTaskTitle,status:"pending"}));
   await done(await db.from("tasks").insert({id:workflowTask,firm_id:firm,student_id:student,workflow_step_id:step,title:workflowTaskTitle,task_type:"follow_up",status:"pending",visibility_scope:"family",assigned_user_id:parent1,owner_role:"parent",created_by_user_id:counselor,updated_by_user_id:counselor}));
   for(const [role,email,path] of [["staff",env!.counselorEmail,`/students/${student}/readiness`],["student",emails.student,"/student-readiness"],["parent1",emails.parent1,`/family-readiness/${student}`],["parent2",emails.parent2,`/family-readiness/${student}`]] as const){
    const context=await browser.newContext(),page=await context.newPage();await signInAs(page,email,path);const card=page.getByRole("region",{name,exact:true});await expect(card).toContainText("Jan 15, 2027");await expect(card).toContainText("Send transcript");await expect(card.getByRole("link",{name:shared,exact:true})).toBeVisible();await expect(card.getByRole("link",{name:sharedTaskTitle,exact:true})).toBeVisible();await expect(card.getByRole("link",{name:workflowTaskTitle,exact:true})).toBeVisible();
    if(role==="staff"){await expect(page.getByRole("link",{name:generalTitle,exact:true})).toBeVisible();await expect(card.getByText(required,{exact:true})).toBeVisible();await expect(card.getByRole("link",{name:privateTitle,exact:true})).toBeVisible();await expect(card.getByRole("link",{name:privateTaskTitle,exact:true})).toBeVisible();}
    else if(role==="student"){await expect(page.getByRole("link",{name:generalTitle,exact:true})).toBeVisible();expect(await page.content()).not.toContain(privateTitle);await expect(card.getByText(required,{exact:true})).toBeVisible();await expect(card.getByRole("link",{name:studentTitle,exact:true})).toBeVisible();await expect(card.getByRole("link",{name:privateTaskTitle,exact:true})).toBeVisible();}
    else {expect(await page.content()).not.toContain(generalTitle);expect(await page.content()).not.toContain(privateTitle);expect(await page.content()).not.toContain(studentTitle);expect(await page.content()).not.toContain(privateTaskTitle);expect(await page.content()).not.toContain(required);await expect(card.getByText(/Required responses to assign/)).toHaveCount(0);}
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);await page.screenshot({path:`/tmp/counselworks-readiness-${role}.png`,fullPage:true});await context.close();
   }
   // Caseload is a staff-only projection; URL filters cannot widen assignment scope.
   await done(await db.from("essay_drafts").update({status:"in_review"}).eq("firm_id",firm).in("id",[privateEssay,generalEssay]));
   await done(await db.from("tasks").update({due_on:"2020-01-01"}).eq("firm_id",firm).eq("id",workflowTask));
   await done(await db.from("applications").update({deadline_source:"estimate"}).eq("firm_id",firm).eq("id",appId));
   const foreignFamily=randomUUID(),foreignStudent=randomUUID(),foreignFirm="b0000000-0000-4000-8000-000000000001",foreignName=`Foreign caseload ${suffix}`;
   await done(await db.from("families").insert({id:foreignFamily,firm_id:foreignFirm,household_name:foreignName,created_by_user_id:"b0000000-0000-4000-8000-000000000011",updated_by_user_id:"b0000000-0000-4000-8000-000000000011"}));
   await done(await db.from("students").insert({id:foreignStudent,firm_id:foreignFirm,family_id:foreignFamily,first_name:"Foreign",last_name:`caseload ${suffix}`,graduation_year:2027,created_by_user_id:"b0000000-0000-4000-8000-000000000011",updated_by_user_id:"b0000000-0000-4000-8000-000000000011"}));
   try {
   const staffContext=await browser.newContext(),staffPage=await staffContext.newPage();
   await signInAs(staffPage,env!.counselorEmail,`/caseload?search=${suffix}`);
   const caseCard=staffPage.getByRole("region",{name:`Interview Student ${suffix} · ${name}`,exact:true});
   expect(await staffPage.content()).not.toContain(foreignName);
   await expect(caseCard.getByRole("link",{name:`Review essay: ${privateTitle}`,exact:true})).toHaveAttribute("href",`/essays/${privateEssay}`);
   await expect(caseCard.getByRole("link",{name:`Follow up: ${workflowTaskTitle}`,exact:true})).toHaveAttribute("href",`/tasks/${workflowTask}`);
   await expect(caseCard).toContainText("estimated — verify");await expect(caseCard).toContainText("Assign 1 required response");
   await staffPage.getByLabel("Counselor",{exact:true}).selectOption(counselor);await staffPage.getByLabel("Graduation year",{exact:true}).selectOption("2027");await staffPage.getByLabel("College",{exact:true}).selectOption(college);await staffPage.getByLabel("Attention needed",{exact:true}).selectOption("review");await staffPage.getByRole("button",{name:"Apply filters",exact:true}).click();await expect(caseCard).toBeVisible();await expect(staffPage.getByRole("status")).toContainText("1 matching work group");
   await staffPage.setViewportSize({width:390,height:844});expect(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page:staffPage}).include("main").analyze()).violations).toEqual([]);await staffPage.screenshot({path:"/tmp/counselworks-caseload-mobile.png",fullPage:true});
   await staffPage.getByRole("link",{name:"Reset filters",exact:true}).click();await expect(staffPage.getByLabel("Student name",{exact:true})).toHaveValue("");await expect(staffPage.getByLabel("Counselor",{exact:true})).toHaveValue("");await expect(staffPage.getByLabel("College",{exact:true})).toHaveValue("");await expect(staffPage.getByLabel("Attention needed",{exact:true})).toHaveValue("attention");await staffPage.goto(`/caseload?search=${suffix}`);
   await caseCard.getByRole("link",{name:"Open student readiness",exact:true}).click();await expect(staffPage.getByRole("heading",{name:"Application readiness",exact:true})).toBeVisible();
   await done(await db.from("student_staff_assignments").delete().eq("firm_id",firm).eq("student_id",student).eq("user_id",counselor));
   try {
    await staffPage.goto(`/caseload?search=${suffix}&attention=all&counselor=${counselor}`);expect(await staffPage.content()).not.toContain(privateTitle);expect(await staffPage.content()).not.toContain(name);await expect(staffPage.getByRole("status")).toContainText("0 matching work groups");
    const ownerContext=await browser.newContext(),ownerPage=await ownerContext.newPage();await signInAs(ownerPage,env!.ownerEmail,`/caseload?search=${suffix}&attention=all`);await expect(ownerPage.getByRole("link",{name:`Review essay: ${privateTitle}`,exact:true})).toBeVisible();expect(await ownerPage.content()).not.toContain(foreignName);await ownerContext.close();
   } finally {await done(await db.from("student_staff_assignments").insert({firm_id:firm,student_id:student,user_id:counselor,assignment_type:"counselor"}));}
   await staffContext.close();
   for(const email of [emails.student,emails.parent1,emails.parent2]) {const portalContext=await browser.newContext(),portalPage=await portalContext.newPage();await signInAs(portalPage,email,`/caseload?search=${suffix}`);await expect(portalPage.getByRole("heading",{name:"Counselor caseload",exact:true})).toHaveCount(0);expect(await portalPage.content()).not.toContain(privateTitle);await portalContext.close();}
   } finally {await done(await db.from("students").delete().eq("firm_id",foreignFirm).eq("id",foreignStudent));await done(await db.from("families").delete().eq("firm_id",foreignFirm).eq("id",foreignFamily));}
   await done(await db.from("college_prompt_sets").update({coverage:"needs_review"}).eq("id",setId));
   const context=await browser.newContext(),page=await context.newPage();await signInAs(page,emails.student,"/student-readiness");const unverified=page.getByRole("region",{name,exact:true});await expect(unverified).toContainText("Requirements need verification");await expect(unverified.getByText(/Required responses to assign/)).toHaveCount(0);await expect(unverified.getByText(required,{exact:true})).toHaveCount(0);await context.close();
  } finally {
   await done(await db.from("tasks").delete().eq("firm_id",firm).in("id",[sharedTask,privateTask,workflowTask]));await done(await db.from("student_workflows").delete().eq("firm_id",firm).eq("id",workflow));await done(await db.from("essay_drafts").delete().eq("firm_id",firm).in("id",[sharedEssay,privateEssay,studentEssay,generalEssay]));await done(await db.from("college_library_prompts").delete().eq("id",promptId));await done(await db.from("college_prompt_sets").delete().eq("id",setId));await done(await db.from("applications").delete().eq("firm_id",firm).eq("id",appId));await done(await db.from("student_colleges").delete().eq("firm_id",firm).eq("id",listId));await done(await db.from("colleges").delete().eq("id",college));
  }
 });
 test("drafting workspace: counselor brings the plan and material beside writing and edits an imported outline",async({page})=>{
  await done(await db.from("essay_drafts").insert({id:draftingEssay,firm_id:firm,student_id:student,essay_type:"supplemental",title:draftingTitle,prompt_text:"Describe a collaboration and what changed.",body:oldDraft,word_count_target:250,visibility_scope:"family",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("essay_draft_versions").insert({essay_draft_id:draftingEssay,version_number:1,body:oldDraft,created_by_user_id:counselor}));
  await done(await db.from("student_story_bank").insert([{id:draftingStory,firm_id:firm,student_id:student,kind:"story",title:draftingStoryTitle,body:"We tested two workshop designs and brought new teammates into the process.",audience:"family",review_state:"confirmed",story_ids:[],created_by_user_id:studentUser},{id:draftingNarrative,firm_id:firm,student_id:student,kind:"narrative",title:draftingNarrativeTitle,body:"Making room for another perspective helps me test my own ideas.",audience:"family",review_state:"confirmed",story_ids:[draftingStory],created_by_user_id:studentUser}]));
  await done(await db.from("essay_ai_suggestions").insert({firm_id:firm,essay_draft_id:draftingEssay,kind:"outline",created_by_user_id:counselor,content:{thesis:outlinePurpose,beats:["hook","body","body","reflection"].map((section,i)=>({section,beat:`Explore real workshop detail ${i+1}`,word_target:50}))}}));
  await signInAs(page,env!.counselorEmail,`${board()}?essay=${draftingEssay}`);await page.getByRole("button",{name:"Plan response",exact:true}).click();let dialog=page.getByRole("dialog");await dialog.getByLabel("Response approach").selectOption("experience");await dialog.getByLabel("What will this response show?").fill(`A distinctive workshop response ${suffix}`);await dialog.locator(`input[name="entry_id"][value="${draftingNarrative}"]`).check();await savePlan(page);
  await page.getByRole("link",{name:"Open essay",exact:true}).click();await expect(page.getByRole("region",{name:"Writing plan",exact:true})).toContainText(`A distinctive workshop response ${suffix}`);await expect(page.getByRole("region",{name:"Stories and narratives connected to this essay",exact:true})).toContainText(draftingStoryTitle);
  await page.getByRole("button",{name:"Start outline",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Use counselor outline",exact:true}).click();await expect(dialog.getByLabel("What should this essay reveal?",{exact:true})).toHaveValue(outlinePurpose);await dialog.getByLabel("Section 1 notes",{exact:true}).fill("Show the moment I invited a teammate to test another design.");await dialog.getByRole("group",{name:"Section 1",exact:true}).getByRole("checkbox",{name:draftingNarrativeTitle,exact:true}).check();await dialog.getByRole("button",{name:"Move section 4 up",exact:true}).click();await dialog.getByRole("button",{name:"Move section 3 down",exact:true}).click();await dialog.getByRole("button",{name:"Save outline",exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole("region",{name:"Essay outline",exact:true})).toContainText(outlinePurpose);
  const draft=await db.from("essay_drafts").select("body,current_version_number,status").eq("firm_id",firm).eq("id",draftingEssay).single();expect(draft.data).toMatchObject({body:oldDraft,current_version_number:1,status:"draft"});await page.screenshot({path:"/tmp/counselworks-drafting-counselor-desktop.png",fullPage:true});
 });
 test("drafting workspace: both parents see shared writing but no working outline, private history or feedback",async({browser})=>{
  for(const email of [emails.parent1,emails.parent2]){const context=await browser.newContext(),page=await context.newPage();await signInAs(page,email,`/family-essays/${draftingEssay}`);await expect(page.getByRole("region",{name:"Essay outline",exact:true})).toContainText("No outline has been shared with family");expect(await page.content()).not.toContain(outlinePurpose);await expect(page.getByRole("button",{name:/^(Start outline|Edit outline)$/})).toHaveCount(0);await expect(page.getByRole("heading",{name:"Compare saved versions",exact:true})).toHaveCount(0);await expect(page.getByLabel("Feedback comment",{exact:true})).toHaveCount(0);await context.close();}
 });
 test("drafting workspace: student reviews the plan and outline, approves parent access and submits writing",async({page})=>{
  await signInAs(page,emails.student,`/student-essays/planning?essay=${draftingEssay}`);await page.getByRole("button",{name:"Edit plan",exact:true}).click();let dialog=page.getByRole("dialog");await dialog.getByLabel("Plan review",{exact:true}).selectOption("confirmed");await dialog.getByRole("checkbox",{name:"Allow my parents or guardians to see this plan note and approach.",exact:true}).check();await savePlan(page);
  await page.getByRole("link",{name:"Open essay",exact:true}).click();await expect(page.getByRole("region",{name:"Essay outline",exact:true})).toContainText("The plan, prompt or source material changed");await page.getByRole("button",{name:"Edit outline",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel("Outline review",{exact:true}).selectOption("confirmed");await dialog.getByRole("checkbox",{name:"Allow my parents or guardians to see this outline.",exact:true}).check();await dialog.getByRole("button",{name:"Save outline",exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole("region",{name:"Essay outline",exact:true})).toContainText("Outline shared with parents");
  await page.getByPlaceholder("Start writing...").fill(firstDraft);await page.getByRole("button",{name:"Save Draft",exact:true}).click();await expect(page.getByRole("button",{name:"Saved",exact:true})).toBeVisible();await page.getByRole("button",{name:"Submit for review",exact:true}).click();await expect(page.getByText("With your counselor",{exact:true})).toBeVisible();await expect(page.getByLabel("Later saved version",{exact:true})).toContainText("Version 3 · Latest submitted");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);await page.screenshot({path:"/tmp/counselworks-drafting-student-mobile.png",fullPage:true});
 });
 test("drafting workspace: approved outlines reach both parents without exposing discarded draft versions",async({browser})=>{
  for(const email of [emails.parent1,emails.parent2]){const context=await browser.newContext(),page=await context.newPage();await signInAs(page,email,`/family-essays/${draftingEssay}`);await expect(page.getByRole("region",{name:"Essay outline",exact:true})).toContainText(outlinePurpose);await expect(page.getByText(firstDraft,{exact:true})).toBeVisible();expect(await page.content()).not.toContain(oldDraft);await expect(page.getByLabel("Earlier saved version",{exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Edit outline",exact:true})).toHaveCount(0);await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);await page.screenshot({path:"/tmp/counselworks-drafting-parent-mobile.png",fullPage:true});await context.close();}
 });
 test("drafting workspace: counselor feedback becomes one student-owned task anchored to its version",async({page})=>{
  await signInAs(page,env!.counselorEmail,`/essays/${draftingEssay}`);await page.getByLabel("Feedback comment",{exact:true}).fill(coachComment);const writing=page.getByPlaceholder("Start writing...");await writing.click();await writing.evaluate((el:HTMLTextAreaElement)=>{el.focus();el.setSelectionRange(0,32);});expect(await writing.evaluate((el:HTMLTextAreaElement)=>({start:el.selectionStart,end:el.selectionEnd}))).toEqual({start:0,end:32});await page.getByRole("button",{name:"Quote selection",exact:true}).click();expect(await writing.evaluate((el:HTMLTextAreaElement)=>({start:el.selectionStart,end:el.selectionEnd}))).toEqual({start:0,end:32});await expect(page.getByRole("button",{name:"Remove quote",exact:true})).toBeVisible();await page.getByRole("button",{name:"Comment",exact:true}).click();await expect(page.getByRole("listitem").filter({hasText:coachComment})).toBeVisible();
  const comment=await db.from("essay_feedback").select("id,version_number,quoted_text").eq("firm_id",firm).eq("essay_draft_id",draftingEssay).eq("body",coachComment).single();expect(comment.error).toBeNull();expect(comment.data).toMatchObject({version_number:3,quoted_text:firstDraft.slice(0,32)});draftingFeedback=comment.data!.id;
  await page.locator(`#feedback-${draftingFeedback}`).getByRole("button",{name:"Create revision task",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByRole("textbox",{name:"Revision task title",exact:true}).fill(revisionTitle);await dialog.getByRole("textbox",{name:"Revision instructions",exact:true}).fill("Show one concrete result for the new teammates.");await dialog.getByLabel("Due date (optional)",{exact:true}).fill("2026-12-01");await dialog.getByRole("button",{name:"Assign revision task",exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator(`#feedback-${draftingFeedback}`).getByRole("link",{name:"Open revision task",exact:true})).toBeVisible();
  const task=await db.from("tasks").select("id,assigned_user_id,visibility_scope,related_entity_id").eq("firm_id",firm).eq("essay_feedback_id",draftingFeedback).single();expect(task.data).toMatchObject({assigned_user_id:studentUser,visibility_scope:"student",related_entity_id:draftingEssay});draftingTask=task.data!.id;
  await page.getByLabel("Review feedback (required for changes)",{exact:true}).fill("Please revise the impact before the next review.");await page.getByLabel("Essay status",{exact:true}).selectOption("revision_requested");await expect(page.getByLabel("Essay status",{exact:true})).toHaveValue("revision_requested");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);await page.screenshot({path:"/tmp/counselworks-drafting-counselor-mobile.png",fullPage:true});
 });
 test("drafting workspace: a refused deletion preserves the essay, versions and feedback",async({page})=>{
  const versions=await db.from("essay_draft_versions").select("id,body,version_number").eq("essay_draft_id",draftingEssay).order("version_number");expect(versions.error).toBeNull();
  await signInAs(page,env!.counselorEmail,`/essays/${draftingEssay}`);await page.getByRole("button",{name:"Delete Essay Draft",exact:true}).click();await page.getByRole("alertdialog",{name:"Delete this essay draft?",exact:true}).getByRole("button",{name:"Delete",exact:true}).click();await expect(page.getByRole("main").getByRole("alert")).toContainText("must be kept for its history");await expect(page).toHaveURL(new RegExp(`/essays/${draftingEssay}$`));
  expect((await db.from("essay_draft_versions").select("id,body,version_number").eq("essay_draft_id",draftingEssay).order("version_number")).data).toEqual(versions.data);expect((await db.from("essay_drafts").select("body").eq("firm_id",firm).eq("id",draftingEssay).single()).data?.body).toBe(firstDraft);expect((await db.from("essay_feedback").select("id").eq("firm_id",firm).eq("id",draftingFeedback).single()).data?.id).toBe(draftingFeedback);
 });
 test("drafting workspace: student compares submitted revisions and completes linked work without approving the essay",async({page})=>{
  await signInAs(page,emails.student,`/student-essays/${draftingEssay}`);
  // Slow scripts must not let the server-rendered textarea accept input that
  // hydration could append to or replace. Release scripts before editing.
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  const scriptPattern = "**/_next/static/**/*.js*";
  await page.route(scriptPattern, async route => { await scriptsReady; await route.continue(); });
  const writing = page.getByPlaceholder("Start writing...");
  try {
    await page.reload({waitUntil:"commit"});
    await expect(writing).toBeDisabled();
    await expect(writing).toHaveValue(firstDraft);
  } finally {
    releaseScripts();
    await page.unroute(scriptPattern);
  }
  await expect(writing).toBeEditable();
  await expect(page.locator(`#feedback-${draftingFeedback}`)).toContainText(firstDraft.slice(0,32));
  await writing.fill(revisedDraft);
  await expect(writing).toHaveValue(revisedDraft);
  await page.getByRole("button",{name:"Save Draft",exact:true}).click();
  await expect(page.getByRole("button",{name:"Saved",exact:true})).toBeVisible();
  expect((await db.from("essay_drafts").select("body").eq("firm_id",firm).eq("id",draftingEssay).single()).data?.body).toBe(revisedDraft);
  await page.getByRole("button",{name:"Submit for review",exact:true}).click();
  await expect(page.getByText("With your counselor",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Earlier saved version",{exact:true})).toContainText("Version 3 · Submitted");await expect(page.getByLabel("Later saved version",{exact:true})).toContainText("Version 5 · Latest submitted");await expect(page.getByLabel("Saved draft changes",{exact:true})).toContainText("three new teammates");await page.screenshot({path:"/tmp/counselworks-drafting-comparison.png",fullPage:true});
  await page.locator(`#feedback-${draftingFeedback}`).getByRole("link",{name:"Open revision task",exact:true}).click();await expect(page.getByRole("link",{name:"Open essay and source feedback",exact:true})).toHaveAttribute("href",`/student-essays/${draftingEssay}#feedback-${draftingFeedback}`);await page.getByRole("button",{name:"Mark complete",exact:true}).click();await expect(page.getByText("Complete.",{exact:true})).toBeVisible();
  expect((await db.from("essay_feedback").select("resolved_at").eq("firm_id",firm).eq("id",draftingFeedback).single()).data?.resolved_at).toBeNull();expect((await db.from("essay_drafts").select("status,current_version_number").eq("firm_id",firm).eq("id",draftingEssay).single()).data).toMatchObject({status:"in_review",current_version_number:5});expect((await db.from("essay_submission_versions").select("version_id").eq("firm_id",firm).eq("essay_id",draftingEssay)).data).toHaveLength(2);
 });
 test("drafting workspace: parents cannot read revision instructions, private comments or submitted-version history",async({page})=>{
  await signInAs(page,emails.parent1,`/family-essays/${draftingEssay}`);expect(await page.content()).not.toContain(coachComment);expect(await page.content()).not.toContain("Show one concrete result for the new teammates.");expect(await page.content()).not.toContain(oldDraft);expect(await page.content()).not.toContain(firstDraft);await expect(page.getByLabel("Earlier saved version",{exact:true})).toHaveCount(0);await page.goto(`/family-tasks/${draftingTask}`);await expect(page.getByRole("heading",{name:revisionTitle,exact:true})).toHaveCount(0);expect(await page.content()).not.toContain(coachComment);
 });
 test("drafting workspace: counselor outline revisions pause parent access and stale writers retain their text",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,`/essays/${draftingEssay}`);await page.getByRole("button",{name:"Edit outline",exact:true}).click();const first=page.getByRole("dialog");const context=await browser.newContext(),other=await context.newPage();await signInAs(other,env!.counselorEmail,`/essays/${draftingEssay}`);await other.getByRole("button",{name:"Edit outline",exact:true}).click();const stale=other.getByRole("dialog");await stale.getByLabel("What should this essay reveal?",{exact:true}).fill("A later unsaved outline purpose");await first.getByLabel("What should this essay reveal?",{exact:true}).fill(`First updated outline purpose ${suffix}`);await first.getByRole("button",{name:"Save outline",exact:true}).click();await expect(first).toHaveCount(0);await stale.getByRole("button",{name:"Save outline",exact:true}).click();await expect(stale.getByRole("alert")).toContainText("changed in another window");await expect(stale.getByLabel("What should this essay reveal?",{exact:true})).toHaveValue("A later unsaved outline purpose");await stale.getByRole("button",{name:"Cancel",exact:true}).click();await stale.getByRole("button",{name:"Discard outline edits",exact:true}).click();await context.close();
  const parentContext=await browser.newContext(),parent=await parentContext.newPage();await signInAs(parent,emails.parent2,`/family-essays/${draftingEssay}`);await expect(parent.getByRole("region",{name:"Essay outline",exact:true})).toContainText("No outline has been shared with family");expect(await parent.content()).not.toContain(`First updated outline purpose ${suffix}`);await parentContext.close();
 });
 test("drafting workspace: disconnected material can be removed without discarding section notes",async({page})=>{
  await signInAs(page,env!.counselorEmail,`${board()}?essay=${draftingEssay}`);await page.getByRole("button",{name:"Edit plan",exact:true}).click();let dialog=page.getByRole("dialog");await dialog.locator(`input[name="entry_id"][value="${draftingNarrative}"]`).uncheck();await dialog.getByLabel("Response approach",{exact:true}).selectOption("research");await savePlan(page);await page.getByRole("link",{name:"Open essay",exact:true}).click();await page.getByRole("button",{name:"Edit outline",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("checkbox",{name:/Previously connected material/}).click();await expect(dialog.getByRole("checkbox",{name:/Previously connected material/})).toHaveCount(0);await expect(dialog.getByLabel("Section 1 notes",{exact:true})).toHaveValue("Show the moment I invited a teammate to test another design.");await dialog.getByRole("button",{name:"Save outline",exact:true}).click();await expect(dialog).toHaveCount(0);
 });
 test("drafting workspace: autosave refresh keeps an open outline's original context and unsaved edits",async({page})=>{
  await signInAs(page,emails.student,`/student-essays/${draftingEssay}`);const working=`${revisedDraft} A working sentence saved automatically.`;await page.getByPlaceholder("Start writing...").fill(working);await page.getByRole("button",{name:"Edit outline",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByLabel("What should this essay reveal?",{exact:true}).fill("My outline before a background plan change");
  const plan=await db.from("student_essay_plans").select("revision").eq("firm_id",firm).eq("essay_id",draftingEssay).single();await done(await db.from("student_essay_plans").update({angle:`A newly changed plan ${suffix}`,revision:plan.data!.revision+1,review_state:"draft",family_shared:false}).eq("firm_id",firm).eq("essay_id",draftingEssay));
  await expect.poll(async()=>(await db.from("essay_drafts").select("body").eq("firm_id",firm).eq("id",draftingEssay).single()).data?.body,{timeout:30_000}).toBe(working);await expect(page.getByRole("region",{name:"Writing plan",exact:true})).toContainText(`A newly changed plan ${suffix}`);await expect(dialog.getByLabel("What should this essay reveal?",{exact:true})).toHaveValue("My outline before a background plan change");await dialog.getByRole("button",{name:"Save outline",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("changed in another window");await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await dialog.getByRole("button",{name:"Discard outline edits",exact:true}).click();
  await expect(page.getByRole("button",{name:"Save Draft",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Save Draft",exact:true}).click();await expect(page.getByRole("button",{name:"Saved",exact:true})).toBeVisible();expect((await db.from("essay_drafts").select("current_version_number").eq("firm_id",firm).eq("id",draftingEssay).single()).data?.current_version_number).toBe(6);
 });
 test("drafting workspace: resolving source feedback during autosave preserves unsaved revision instructions",async({page,browser})=>{
  const source=`A follow-up revision discussion ${suffix}`,instructions="My instructions before another counselor resolved the comment.";
  // A slow client must not expose an editable SSR field that later clears on hydration.
  await signInAs(page,env!.counselorEmail,`/essays/${draftingEssay}`);
  const staticContext=await browser.newContext({storageState:await page.context().storageState(),javaScriptEnabled:false}),staticPage=await staticContext.newPage();
  try {await staticPage.goto(`/essays/${draftingEssay}`);await expect(staticPage.getByLabel("Feedback comment",{exact:true})).toBeDisabled();await expect(staticPage.getByRole("button",{name:"Comment",exact:true,includeHidden:true})).toBeDisabled();} finally {await staticContext.close();}

  await expect(page.getByLabel("Feedback comment",{exact:true})).toBeEnabled();await page.getByLabel("Feedback comment",{exact:true}).fill(source);await page.getByRole("button",{name:"Comment",exact:true}).click();await expect(page.getByRole("listitem").filter({hasText:source})).toBeVisible();
  const f=await db.from("essay_feedback").select("id").eq("firm_id",firm).eq("essay_draft_id",draftingEssay).eq("body",source).single();expect(f.error).toBeNull();const feedbackId=f.data!.id;
  const working=`${await page.getByPlaceholder("Start writing...").inputValue()} A counselor working sentence.`;await page.getByPlaceholder("Start writing...").fill(working);await page.locator(`#feedback-${feedbackId}`).getByRole("button",{name:"Create revision task",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByRole("textbox",{name:"Revision instructions",exact:true}).fill(instructions);
  const context=await browser.newContext(),other=await context.newPage();await signInAs(other,env!.counselorEmail,`/essays/${draftingEssay}`);await other.locator(`#feedback-${feedbackId}`).getByRole("button",{name:"Mark resolved",exact:true}).click();await expect.poll(async()=>(await db.from("essay_feedback").select("resolved_at").eq("firm_id",firm).eq("id",feedbackId).single()).data?.resolved_at).toBeTruthy();await context.close();
  await expect.poll(async()=>(await db.from("essay_drafts").select("body").eq("firm_id",firm).eq("id",draftingEssay).single()).data?.body,{timeout:30_000}).toBe(working);await expect(dialog.getByText(/This comment was resolved/)).toBeVisible();await expect(dialog.getByRole("textbox",{name:"Revision instructions",exact:true})).toHaveValue(instructions);await dialog.getByRole("button",{name:"Assign revision task",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("unresolved counselor comment");await expect(dialog.getByRole("textbox",{name:"Revision instructions",exact:true})).toHaveValue(instructions);await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await dialog.getByRole("button",{name:"Discard instructions",exact:true}).click();await expect(dialog).toHaveCount(0);expect((await db.from("tasks").select("id").eq("firm_id",firm).eq("essay_feedback_id",feedbackId)).data).toEqual([]);
 });
 test("drafting workspace: withdrawing the source essay also hides revision work from portal lists and direct links",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,`/essays/${draftingEssay}`);await page.locator("#essay-visibility").selectOption("staff");await expect.poll(async()=>(await db.from("tasks").select("visibility_scope").eq("firm_id",firm).eq("id",draftingTask).single()).data?.visibility_scope).toBe("staff");
  const context=await browser.newContext(),portal=await context.newPage();await signInAs(portal,emails.student,"/student-tasks");expect(await portal.content()).not.toContain(revisionTitle);await portal.goto(`/student-tasks/${draftingTask}`);await expect(portal.getByRole("heading",{name:revisionTitle,exact:true})).toHaveCount(0);expect(await portal.content()).not.toContain(coachComment);await context.close();
 });
 test("follow-through: counselor records receipt, portal and sent materials without claiming college receipt",async({page,browser})=>{
  await done(await db.from("colleges").insert({id:followCollege,name:`Follow-through College ${suffix}`,slug:`follow-through-${suffix}`}));
  await done(await db.from("student_colleges").insert({id:followSchool,firm_id:firm,student_id:student,college_id:followCollege,category:"target",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("applications").insert({id:followApp,firm_id:firm,student_id:student,student_college_id:followSchool,college_id:followCollege,application_type:"rd",stage:"submitted",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("documents").insert({id:followDocument,firm_id:firm,student_id:student,application_id:followApp,category:"transcript",title:"Transcript dispatch confirmation",storage_key:`test/follow-through/${followDocument}.pdf`,mime_type:"application/pdf",visibility_scope:"student",uploaded_by_user_id:counselor}));
  await signInAs(page,env!.counselorEmail,`/applications/${followApp}/follow-through`);
  await expect(page.getByRole("heading",{name:"Application follow-through",exact:true})).toBeVisible();
  for(const kind of ["application acknowledgment","applicant portal","material"]) {
   await page.getByRole("button",{name:`Add ${kind}`,exact:true}).click();const dialog=page.getByRole("dialog");
   if(kind==="material") {
    await dialog.getByLabel("Item name",{exact:true}).fill("School transcript");await dialog.getByLabel("Tracking status",{exact:true}).selectOption("sent");
    await dialog.getByLabel("Date sent",{exact:true}).fill(followToday);await dialog.getByLabel("Supporting document",{exact:true}).selectOption(followDocument);
    await dialog.getByLabel("Tracking notes or confirmation reference",{exact:true}).fill("School sent the transcript; college receipt is still unconfirmed.");
   }
   if(kind==="applicant portal") {await dialog.getByLabel("Tracking status",{exact:true}).selectOption("active");await dialog.getByLabel("Applicant portal address",{exact:true}).fill("https://admissions.example.edu/login");}
   await dialog.getByLabel("Last checked",{exact:true}).fill(followToday);await dialog.getByRole("button",{name:"Save tracking",exact:true}).click();await expect(dialog).toHaveCount(0);
  }
  const rows=await db.from("application_follow_through_items").select("id,kind,status").eq("firm_id",firm).eq("application_id",followApp);expect(rows.error).toBeNull();followMaterial=rows.data!.find(r=>r.kind==="material")!.id;followReceipt=rows.data!.find(r=>r.kind==="receipt")!.id;
  await expect(page.locator(`#tracking-${followMaterial}`)).toContainText("Sent — awaiting receipt");
  for(const email of [emails.parent1,emails.parent2]) {const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,email,`/family-applications/${followApp}/follow-through`);await expect(parent.getByText("No follow-through items are currently shared with you.")).toBeVisible();expect(await parent.content()).not.toContain("School transcript");await context.close();}
  await page.goto(`/caseload?attention=follow_through&search=Interview`);await expect(page.getByRole("link",{name:"Confirm material: School transcript",exact:true})).toBeVisible();await page.getByRole("link",{name:"Confirm material: School transcript",exact:true}).click();await expect(page).toHaveURL(new RegExp(`/applications/${followApp}/follow-through#tracking-`));
 });
 test("follow-through: student creates an owned reminder, completes the task and shares one item",async({page})=>{
  await signInAs(page,emails.student,`/student-applications/${followApp}/follow-through`);
  const receipt=page.locator(`#tracking-${followReceipt}`);await receipt.getByText("Schedule follow-up",{exact:true}).click();await receipt.getByLabel("Follow-up date",{exact:true}).fill(followToday);await receipt.getByRole("button",{name:"Create follow-up",exact:true}).click();await expect(receipt.getByRole("link",{name:"Open follow-up",exact:true})).toBeVisible();
  await receipt.getByText("Reschedule follow-up",{exact:true}).click();const reschedule=receipt.locator("details").filter({hasText:"Reschedule follow-up"});const later=new Date(Date.now()+2*86400000).toISOString().slice(0,10);await reschedule.getByLabel("Follow-up date",{exact:true}).fill(later);await reschedule.getByRole("button",{name:"Save follow-up date and owner",exact:true}).click();await expect.poll(async()=>(await db.from("tasks").select("due_on").eq("firm_id",firm).eq("follow_through_item_id",followReceipt).single()).data?.due_on).toBe(later);
  await receipt.getByRole("link",{name:"Open follow-up",exact:true}).click();await expect(page.getByRole("link",{name:"Open application follow-through",exact:true})).toBeVisible();await page.getByRole("button",{name:"Mark complete",exact:true}).click();await expect(page.getByText("Complete.",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Open application follow-through",exact:true}).click();await expect(page.locator(`#tracking-${followReceipt}`)).toContainText("Awaiting acknowledgment");
  await page.locator(`#tracking-${followMaterial}`).getByRole("button",{name:"Share item with parents",exact:true}).click();await expect(page.locator(`#tracking-${followMaterial}`)).toContainText("Shared with parents by the student");
 });
 test("follow-through: parent assignments preserve source permissions and both guardians see only approved items",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,`/applications/${followApp}/follow-through`);const card=page.locator(`#tracking-${followMaterial}`);
  await card.getByText("Schedule follow-up",{exact:true}).click();await card.getByLabel("Responsible person",{exact:true}).selectOption(parent1);await card.getByLabel("Follow-up date",{exact:true}).fill(followToday);await card.getByRole("button",{name:"Create follow-up",exact:true}).click();await expect(card.getByRole("link",{name:"Open follow-up",exact:true})).toBeVisible();
  followParentTask=(await db.from("tasks").select("id").eq("firm_id",firm).eq("follow_through_item_id",followMaterial).single()).data!.id;
  for(const [email,canComplete] of [[emails.parent1,true],[emails.parent2,false]] as const) {
   const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,email,`/family-applications/${followApp}/follow-through`);
   await expect(parent.locator(`#tracking-${followMaterial}`)).toBeVisible();await expect(parent.locator(`#tracking-${followReceipt}`)).toHaveCount(0);await expect(parent.getByRole("button",{name:"Edit tracking",exact:true})).toHaveCount(0);expect(await parent.content()).not.toContain("Transcript dispatch confirmation");
   await parent.getByRole("link",{name:"Open follow-up",exact:true}).click();await expect(parent.getByRole("button",{name:"Mark complete",exact:true})).toHaveCount(canComplete?1:0);await context.close();
  }
  await done(await db.from("documents").update({visibility_scope:"family"}).eq("firm_id",firm).eq("id",followDocument));
  const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,emails.parent1,`/family-applications/${followApp}/follow-through`);await expect(parent.getByRole("link",{name:"Supporting document: Transcript dispatch confirmation",exact:true})).toBeVisible();
  await done(await db.from("documents").update({visibility_scope:"student"}).eq("firm_id",firm).eq("id",followDocument));await parent.reload();expect(await parent.content()).not.toContain("Transcript dispatch confirmation");await context.close();
 });
 test("follow-through: stale edits preserve writing and source changes revoke parent tasks and queued reminders",async({page,browser})=>{
  await signInAs(page,emails.student,`/student-applications/${followApp}/follow-through`);await page.locator(`#tracking-${followMaterial}`).getByRole("button",{name:"Edit tracking",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByLabel("Tracking notes or confirmation reference",{exact:true}).fill("My unsaved tracking details");
  const context=await browser.newContext(),staff=await context.newPage();await signInAs(staff,env!.counselorEmail,`/applications/${followApp}/follow-through`);await staff.locator(`#tracking-${followMaterial}`).getByRole("button",{name:"Edit tracking",exact:true}).click();const other=staff.getByRole("dialog");await other.getByLabel("Tracking notes or confirmation reference",{exact:true}).fill("Updated tracking for student review");await other.getByRole("button",{name:"Save tracking",exact:true}).click();await expect(other).toHaveCount(0);await context.close();
  await dialog.getByRole("button",{name:"Save tracking",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("changed in another window");await expect(dialog.getByLabel("Tracking notes or confirmation reference",{exact:true})).toHaveValue("My unsaved tracking details");await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await dialog.getByRole("button",{name:"Discard tracking edits",exact:true}).click();
  const parentContext=await browser.newContext(),parent=await parentContext.newPage();await signInAs(parent,emails.parent1,"/family-tasks");expect(await parent.content()).not.toContain("Follow up: School transcript");await parent.goto(`/family-tasks/${followParentTask}`);await expect(parent.getByRole("heading",{name:"Follow up: School transcript",exact:true})).toHaveCount(0);await parent.goto(`/family-applications/${followApp}/follow-through`);expect(await parent.content()).not.toContain("Updated tracking for student review");await parentContext.close();
  expect((await db.rpc("task_notice_allowed",{p_task:followParentTask,p_user:parent1})).data).toBe(false);
  await page.reload();await page.locator(`#tracking-${followMaterial}`).getByRole("button",{name:"Edit tracking",exact:true}).click();const received=page.getByRole("dialog");await received.getByLabel("Tracking status",{exact:true}).selectOption("received");await received.getByLabel("Receipt confirmed on",{exact:true}).fill(followToday);await received.getByRole("button",{name:"Save tracking",exact:true}).click();await expect(received).toHaveCount(0);await expect(page.locator(`#tracking-${followMaterial}`)).toContainText("Received by college");await expect(page.locator(`#tracking-${followMaterial}`)).toContainText("Cancelled");
  expect((await db.from("tasks").select("status").eq("firm_id",firm).eq("id",followParentTask).single()).data?.status).toBe("cancelled");
  await page.locator(`#tracking-${followMaterial}`).getByRole("button",{name:"Share item with parents",exact:true}).click();await expect(page.locator(`#tracking-${followMaterial}`)).toContainText("Shared with parents by the student");
 });
 test("follow-through: assignment withdrawal and read-only staff cannot edit tracking",async({page})=>{
  await done(await db.from("student_staff_assignments").delete().eq("firm_id",firm).eq("student_id",student).eq("user_id",counselor));
  try {await signInAs(page,env!.counselorEmail,`/applications/${followApp}/follow-through`);await expect(page.getByRole("heading",{name:"Application follow-through",exact:true})).toHaveCount(0);expect(await page.content()).not.toContain("School transcript");}
  finally {await done(await db.from("student_staff_assignments").insert({firm_id:firm,student_id:student,user_id:counselor,assignment_type:"counselor"}));}
  await done(await db.from("firm_memberships").update({role:"read_only_staff"}).eq("firm_id",firm).eq("user_id",counselor));
  try {await page.goto(`/applications/${followApp}/follow-through`);await expect(page.getByRole("heading",{name:"Application follow-through",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Edit tracking",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Add material",exact:true})).toHaveCount(0);}
  finally {await done(await db.from("firm_memberships").update({role:"counselor"}).eq("firm_id",firm).eq("user_id",counselor));}
 });
 test("follow-through: all three role views fit mobile and pass accessibility checks",async({browser})=>{
  for(const [email,surface] of [[env!.counselorEmail,"applications"],[emails.student,"student-applications"],[emails.parent2,"family-applications"]]) {
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await signInAs(page,email,`/${surface}/${followApp}/follow-through`);await expect(page.getByRole("heading",{name:"Application follow-through",exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa"]).analyze()).violations).toEqual([]);
   if(surface==="applications") await page.screenshot({path:"/tmp/counselworks-follow-through-mobile.png",fullPage:true});await context.close();
  }
 });


 test("decision workspace: counselor records history, creates a checklist and links a separate letter",async({page})=>{
  await done(await db.from("colleges").insert({id:decisionCollege,name:`Decision College ${suffix}`,slug:`decision-${suffix}`}));
  await done(await db.from("student_colleges").insert({id:decisionSchool,firm_id:firm,student_id:student,college_id:decisionCollege,category:"target",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("applications").insert({id:decisionApp,firm_id:firm,student_id:student,student_college_id:decisionSchool,college_id:decisionCollege,application_type:"rd",stage:"submitted",created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("documents").insert({id:decisionDocument,firm_id:firm,student_id:student,title:"Private decision instructions",storage_key:`test/decision/${decisionDocument}.pdf`,category:"other",mime_type:"application/pdf",visibility_scope:"student",uploaded_by_user_id:counselor}));
  await signInAs(page,env!.counselorEmail,decisionPath());await page.getByRole("button",{name:"Record decision or enrollment",exact:true}).click();let dialog=page.getByRole("dialog");await dialog.getByLabel("Decision",{exact:true}).selectOption("deferred");await dialog.getByRole("button",{name:"Save decision",exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator("#current-outcome").locator("..")).toContainText("Deferred");
  await page.getByRole("button",{name:"Add suggested checklist",exact:true}).click();await expect(page.getByRole("heading",{name:"Plan a deferral update letter",exact:true})).toBeVisible();await page.getByRole("button",{name:"Add suggested checklist",exact:true}).click();await expect(page.getByRole("heading",{name:"Plan a deferral update letter",exact:true})).toHaveCount(1);
  decisionStep=(await db.from("application_next_steps").select("id").eq("firm_id",firm).eq("application_id",decisionApp).eq("template_key","letter").single()).data!.id;
  const card=page.locator(`#next-step-${decisionStep}`);await card.getByRole("button",{name:"Create letter draft",exact:true}).click();await expect(card.getByRole("link",{name:"Open writing: Deferral update letter",exact:true})).toBeVisible();
  decisionLetter=(await db.from("application_next_steps").select("essay_id").eq("firm_id",firm).eq("id",decisionStep).single()).data!.essay_id;
  await card.getByRole("button",{name:"Edit next step",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel("Supporting document",{exact:true}).selectOption(decisionDocument);await dialog.getByLabel("College response or requirement deadline",{exact:true}).fill(followToday);await dialog.getByRole("button",{name:"Save next step",exact:true}).click();await expect(dialog).toHaveCount(0);
  await card.getByRole("link",{name:"Open writing: Deferral update letter",exact:true}).click();await expect(page.getByRole("textbox",{name:"Essay title...",exact:true})).toHaveValue("Deferral update letter");await expect(page.getByLabel("For college",{exact:true})).toBeDisabled();await page.getByRole("link",{name:"Open essay planning board",exact:true}).click();await expect(page.locator(`#planning-${decisionLetter}`)).toBeVisible();await page.goto(`/essays/${decisionLetter}`);await page.getByRole("link",{name:"Back to decision and enrollment",exact:true}).click();await expect(page.getByRole("heading",{name:"Decision and enrollment",exact:true})).toBeVisible();
  const preview=await db.rpc("application_review_preview",{p_firm:firm,p_actor:counselor,p_application:decisionApp});expect(preview.error).toBeNull();expect(preview.data.manifest.essays).toEqual([]);
 });
 test("decision workspace: student sharing excludes private documents and letters from both parents",async({page,browser})=>{
  await signInAs(page,emails.student,decisionPath("student-applications"));await expect(page.getByRole("button",{name:"Record decision or enrollment",exact:true})).toHaveCount(0);const card=page.locator(`#next-step-${decisionStep}`);await card.getByRole("button",{name:"Edit next step",exact:true}).click();const dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Supporting document",{exact:true})).toHaveValue(decisionDocument);await dialog.getByLabel("Step notes or confirmation reference",{exact:true}).fill("Discuss the new project in my update");await dialog.getByRole("button",{name:"Save next step",exact:true}).click();await expect(dialog).toHaveCount(0);await card.getByRole("button",{name:"Share step with parents",exact:true}).click();await expect(card).toContainText("Shared with parents by the student");
  for(const email of [emails.parent1,emails.parent2]) {
   const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,email,decisionPath("family-applications"));await expect(parent.locator(`#next-step-${decisionStep}`)).toContainText("Discuss the new project");await expect(parent.locator("#decision-history").locator("..")).toContainText("Deferred");await expect(parent.getByRole("button",{name:"Edit next step",exact:true})).toHaveCount(0);expect(await parent.content()).not.toContain("Private decision instructions");expect(await parent.content()).not.toContain(decisionLetter);expect(await parent.content()).not.toContain(decisionDocument);
   await parent.goto(`/family-essays/${decisionLetter}`);await expect(parent.getByRole("heading",{name:"Deferral update letter",exact:true})).toHaveCount(0);await context.close();
  }
  await done(await db.from("essay_drafts").update({visibility_scope:"family",updated_by_user_id:studentUser}).eq("firm_id",firm).eq("id",decisionLetter));
  const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,emails.parent1,decisionPath("family-applications"));await expect(parent.getByRole("link",{name:"Open writing: Deferral update letter",exact:true})).toBeVisible();await done(await db.from("essay_drafts").update({visibility_scope:"student",updated_by_user_id:studentUser}).eq("firm_id",firm).eq("id",decisionLetter));await parent.reload();expect(await parent.content()).not.toContain(decisionLetter);await context.close();
 });
 test("decision workspace: assigned parent follow-up and stale edits obey current consent",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,decisionPath());const card=page.locator(`#next-step-${decisionStep}`);await card.getByText("Schedule follow-up",{exact:true}).click();await card.getByLabel("Responsible person",{exact:true}).selectOption(parent1);await card.getByLabel("Follow-up date",{exact:true}).fill(followToday);await card.getByRole("button",{name:"Create follow-up",exact:true}).click();await expect(card.getByRole("link",{name:"Open follow-up",exact:true})).toBeVisible();decisionTask=(await db.from("tasks").select("id").eq("firm_id",firm).eq("application_next_step_id",decisionStep).single()).data!.id;
  const parentContext=await browser.newContext(),parent=await parentContext.newPage();await signInAs(parent,emails.parent1,`/family-tasks/${decisionTask}`);await parent.getByRole("button",{name:"Mark complete",exact:true}).click();await expect(parent.getByRole("button",{name:"Mark complete",exact:true})).toHaveCount(0);expect((await db.from("application_next_steps").select("status").eq("firm_id",firm).eq("id",decisionStep).single()).data!.status).toBe("needed");await parentContext.close();
  const context=await browser.newContext(),studentPage=await context.newPage();await signInAs(studentPage,emails.student,decisionPath("student-applications"));await studentPage.locator(`#next-step-${decisionStep}`).getByRole("button",{name:"Edit next step",exact:true}).click();const studentDialog=studentPage.getByRole("dialog");await studentDialog.getByLabel("Step notes or confirmation reference",{exact:true}).fill("Keep this unsaved thought");
  await card.getByRole("button",{name:"Edit next step",exact:true}).click();const staffDialog=page.getByRole("dialog");await staffDialog.getByLabel("Step notes or confirmation reference",{exact:true}).fill("Updated private instructions");await staffDialog.getByRole("button",{name:"Save next step",exact:true}).click();await expect(staffDialog).toHaveCount(0);await studentDialog.getByRole("button",{name:"Save next step",exact:true}).click();await expect(studentDialog.getByRole("alert")).toContainText("changed");await expect(studentDialog.getByLabel("Step notes or confirmation reference",{exact:true})).toHaveValue("Keep this unsaved thought");await context.close();
  const verifyContext=await browser.newContext(),verify=await verifyContext.newPage();await signInAs(verify,emails.parent1,decisionPath("family-applications"));await expect(verify.locator(`#next-step-${decisionStep}`)).toHaveCount(0);await verify.goto(`/family-tasks/${decisionTask}`);await expect(verify.getByRole("heading",{name:/Next step:/})).toHaveCount(0);await verifyContext.close();expect((await db.rpc("task_notice_allowed",{p_task:decisionTask,p_user:parent1})).data).toBe(false);
 });
 test("decision workspace: acceptance preserves history, retires follow-ups and starts enrollment",async({page})=>{
  await signInAs(page,env!.counselorEmail,decisionPath());const card=page.locator(`#next-step-${decisionStep}`);await card.getByText("Schedule follow-up",{exact:true}).click();await card.getByLabel("Responsible person",{exact:true}).selectOption(counselor);await card.getByLabel("Follow-up date",{exact:true}).fill(followToday);await card.getByRole("button",{name:"Create follow-up",exact:true}).click();await expect(card.getByRole("link",{name:"Open follow-up",exact:true})).toHaveCount(2);
  for(const result of ["waitlisted","accepted"]){await page.getByRole("button",{name:"Record decision or enrollment",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByLabel("Decision",{exact:true}).selectOption(result);if(result==="accepted")await dialog.getByLabel("Deposit / enrollment",{exact:true}).selectOption("committed");await dialog.getByRole("button",{name:"Save decision",exact:true}).click();await expect(dialog).toHaveCount(0);}
  await expect(page.locator("#decision-history").locator("..").locator("li")).toHaveCount(3);await expect(card).toContainText("Previous decision plan");await expect(card).toContainText("Cancelled");await page.getByRole("button",{name:"Add suggested checklist",exact:true}).click();const enrollment=page.getByRole("heading",{name:"Confirm enrollment choice and deposit",exact:true}).locator("../..");await enrollment.getByRole("button",{name:"Edit next step",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByLabel("Step status",{exact:true}).selectOption("completed");await dialog.getByLabel("Confirmed complete on",{exact:true}).fill(followToday);await dialog.getByLabel("Step notes or confirmation reference",{exact:true}).fill("College portal confirmed enrollment");await dialog.getByRole("button",{name:"Save next step",exact:true}).click();await expect(dialog).toHaveCount(0);await expect(enrollment).toContainText("Confirmed complete");
  expect((await db.from("student_colleges").select("decision_result,deposit_status").eq("firm_id",firm).eq("id",decisionSchool).single()).data).toEqual({decision_result:"accepted",deposit_status:"committed"});
 });
 test("decision workspace: assignment withdrawal and read-only staff preserve access rules",async({page})=>{
  await done(await db.from("student_staff_assignments").delete().eq("firm_id",firm).eq("student_id",student).eq("user_id",counselor));try{await signInAs(page,env!.counselorEmail,decisionPath());await expect(page.getByRole("heading",{name:"Decision and enrollment",exact:true})).toHaveCount(0);}finally{await done(await db.from("student_staff_assignments").insert({firm_id:firm,student_id:student,user_id:counselor,assignment_type:"counselor"}));}
  await done(await db.from("firm_memberships").update({role:"read_only_staff"}).eq("firm_id",firm).eq("user_id",counselor));try{await page.goto(decisionPath());await expect(page.getByRole("heading",{name:"Decision and enrollment",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Record decision or enrollment",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Add next step",exact:true})).toHaveCount(0);}finally{await done(await db.from("firm_memberships").update({role:"counselor"}).eq("firm_id",firm).eq("user_id",counselor));}
 });
 test("decision workspace: all three mobile views are accessible",async({browser})=>{
  for(const [email,surface]of [[env!.counselorEmail,"applications"],[emails.student,"student-applications"],[emails.parent2,"family-applications"]]){const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await signInAs(page,email,decisionPath(surface));await expect(page.getByRole("heading",{name:"Decision and enrollment",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa"]).analyze()).violations).toEqual([]);if(surface==="applications")await page.screenshot({path:"/tmp/counselworks-decisions-mobile.png",fullPage:true});await context.close();}
 });

});

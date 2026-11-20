import {randomUUID} from "node:crypto";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {e2eEnv} from "./helpers/env";
import {ensureClerkUser,signInAs} from "./helpers/clerk";
import {startInterviewAiProvider} from "./helpers/ai-provider";

const env=e2eEnv();
test.describe.serial("Shared student context and interview AI",()=>{
 test.skip(!env,"Requires Clerk development identities");
 const firm="a0000000-0000-4000-8000-000000000001",counselor="e2e00000-0000-4000-8000-000000000012";
 const student=randomUUID(),family=randomUUID(),studentUser=randomUUID(),parent1=randomUUID(),parent2=randomUUID(),answer=randomUUID();
 const suffix=process.env.E2E_INTERVIEW_SUFFIX||"finalreview20261116";
 const emails={student:`e2e-student-interview-${suffix}+clerk_test@example.com`,parent1:`e2e-parent1-interview-${suffix}+clerk_test@example.com`,parent2:`e2e-parent2-interview-${suffix}+clerk_test@example.com`};
 const studentText="I repaired a workshop item with a friend and tried three designs.",privateOne="PRIVATE FIRST PARENT ONLY",privateTwo="PRIVATE SECOND PARENT ONLY";
 let db:SupabaseClient,provider:Awaited<ReturnType<typeof startInterviewAiProvider>>,storyId:string,briefId:string;
 const staffPath=`/students/${student}/interview`,parentPath=`/family-interview/${student}`;
 async function done(result:{error:unknown}){expect(result.error).toBeNull();}
 async function openAi(page:Page){await page.getByRole("button",{name:"AI interview assistance",exact:true}).click();await page.getByRole("button",{name:"Review AI context",exact:true}).click();await expect(page.getByRole("button",{name:"Ask for suggestions",exact:true})).toBeVisible();}
 async function generate(page:Page,mode:string,label:RegExp){await page.getByLabel("Help with",{exact:true}).selectOption(mode);await page.getByRole("checkbox",{name:label}).check();await page.getByRole("button",{name:"Ask for suggestions",exact:true}).click();const card=page.getByRole("article",{name:`AI ${mode} suggestion`,exact:true});await expect(card).toBeVisible();await expect(page.getByRole("button",{name:"Ask for suggestions",exact:true})).toBeEnabled();return card;}
 async function generateGap(page:Page,mode:"story"|"narrative"|"strategy",label:RegExp){
  const names={story:"Possible stories",narrative:"Possible narrative themes",strategy:"Counselor strategy notes"};
  provider.controls.needsContext=true;
  try{
   await page.getByLabel("Help with",{exact:true}).selectOption(mode);await page.getByRole("checkbox",{name:label}).check();await page.getByRole("button",{name:"Ask for suggestions",exact:true}).click();
   const card=page.getByRole("article",{name:`Needs more context: ${names[mode]}`,exact:true});await expect(card).toBeVisible();await expect(page.getByRole("button",{name:"Ask for suggestions",exact:true})).toBeEnabled();return card;
  }finally{provider.controls.needsContext=false;}
 }
 test.beforeAll(async()=>{
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(new URL(process.env.E2E_BASE_URL??"http://localhost:3000").hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(process.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4319");
  provider=await startInterviewAiProvider();db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  for(const [kind,email]of Object.entries(emails))await ensureClerkUser(email,"Interview",kind);
  await done(await db.from("users").insert([{id:studentUser,email:emails.student,first_name:"AI",last_name:"Student",auth_provider_user_id:`invited_ai_student_${student}`},{id:parent1,email:emails.parent1,first_name:"AI",last_name:"Parent One",auth_provider_user_id:`invited_ai_parent1_${student}`},{id:parent2,email:emails.parent2,first_name:"AI",last_name:"Parent Two",auth_provider_user_id:`invited_ai_parent2_${student}`} ]));
  await done(await db.from("firm_memberships").insert([{firm_id:firm,user_id:studentUser,role:"student"},{firm_id:firm,user_id:parent1,role:"parent_guardian"},{firm_id:firm,user_id:parent2,role:"parent_guardian"}]));
  await done(await db.from("families").insert({id:family,firm_id:firm,household_name:`AI household ${student}`,created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("family_members").insert([{firm_id:firm,family_id:family,user_id:parent1,relationship_type:"parent"},{firm_id:firm,family_id:family,user_id:parent2,relationship_type:"parent"}]));
  await done(await db.from("students").insert({id:student,firm_id:firm,family_id:family,user_id:studentUser,first_name:"AI",last_name:"Student",school_name:"Example High",graduation_year:2027,created_by_user_id:counselor,updated_by_user_id:counselor}));
  await done(await db.from("student_profiles").insert({firm_id:firm,student_id:student}));
  await done(await db.from("student_staff_assignments").insert({firm_id:firm,student_id:student,user_id:counselor,assignment_type:"counselor"}));
  await done(await db.from("student_interview_answers").insert([{id:answer,firm_id:firm,student_id:student,respondent_user_id:studentUser,respondent_kind:"student",question_key:"B1",answer:studentText,state:"answered",audience:"counselor"},{id:randomUUID(),firm_id:firm,student_id:student,respondent_user_id:parent1,respondent_kind:"parent",question_key:"R1",answer:privateOne,state:"answered",audience:"counselor"},{id:randomUUID(),firm_id:firm,student_id:student,respondent_user_id:parent2,respondent_kind:"parent",question_key:"R1",answer:privateTwo,state:"answered",audience:"counselor"}]));
  await done(await db.from("student_strategy_sections").insert({firm_id:firm,student_id:student,section_key:"counselor_notes",body:"PRIVATE COUNSELOR CONTEXT",publication_state:"draft",created_by_user_id:counselor,updated_by_user_id:counselor}));
 });
 test.afterAll(async()=>{
  await provider?.close();if(!db)return;
  for(const table of ["student_ai_requests","student_strategy_sections","student_story_essay_links","student_interview_followups","student_story_bank","student_interview_answers","student_interview_checkpoints","student_staff_assignments","student_profiles"])await done(await db.from(table).delete().eq("firm_id",firm).eq("student_id",student));
  await done(await db.from("students").delete().eq("firm_id",firm).eq("id",student));await done(await db.from("family_members").delete().eq("firm_id",firm).eq("family_id",family));await done(await db.from("families").delete().eq("firm_id",firm).eq("id",family));
  await done(await db.from("firm_memberships").delete().eq("firm_id",firm).in("user_id",[studentUser,parent1,parent2]));await done(await db.from("users").delete().in("id",[studentUser,parent1,parent2]));
 });
 test("student explores a question in their own words; changed context hides the old suggestion",async({page})=>{
  await signInAs(page,emails.student,"/student-interview");await openAi(page);await page.getByLabel("Interview stage",{exact:true}).selectOption("2");
  const card=await generate(page,"questions",/^B1 ·/);expect(JSON.stringify(provider.calls.at(-1))).not.toMatch(/PRIVATE|counselor_notes/);
  await card.getByRole("button",{name:"Explore in my interview",exact:true}).click();const response=page.locator('form[data-question="B1"]');await expect(response).toContainText("AI question to explore");
  await response.getByLabel("Your response",{exact:true}).fill(`${studentText} We compared the results together.`);await response.getByRole("button",{name:"Save response",exact:true}).click();await expect(response.getByText("Saved",{exact:true})).toBeVisible();
  await openAi(page);await expect(page.getByRole("article",{name:"AI questions suggestion",exact:true})).toHaveCount(0);
 });
 test("student context gaps cite evidence and open the existing response without writing an answer or story",async({page})=>{
  await signInAs(page,emails.student,"/student-interview");await openAi(page);
  const before=(await db.from("student_interview_answers").select("answer,audience").eq("firm_id",firm).eq("id",answer).single()).data!;
  const card=await generateGap(page,"story",/^B1 ·/);
  await expect(card).toContainText("One question to explore");await expect(card.getByRole("button",{name:/Save .*draft|Add counselor follow-up/})).toHaveCount(0);
  await card.getByText(/^B1 ·/).click();await expect(card).toContainText(before.answer);
  const record=(await db.from("student_ai_requests").select("result,source_refs").eq("firm_id",firm).eq("student_id",student).eq("owner_user_id",studentUser).eq("mode","story").single()).data!;
  expect(record.result).toMatchObject({outcome:"needs_more_context",items:[],contextGap:{sourceKeys:[`answer:${answer}`]}});
  expect((await db.from("student_story_bank").select("id",{count:"exact",head:true}).eq("firm_id",firm).eq("student_id",student)).count).toBe(0);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({path:test.info().outputPath("needs-context-mobile.png"),fullPage:true});
  await card.getByRole("button",{name:"Explore in my response",exact:true}).click();
  const response=page.locator('form[data-question="B1"]');await expect(response).toContainText("AI question to explore");await expect(response.getByLabel("Your response",{exact:true})).toHaveValue(before.answer);
  const ownWords="I remember comparing the three designs with my friend. I am still deciding which detail matters to me.";
  await response.getByLabel("Your response",{exact:true}).fill(ownWords);await response.getByRole("button",{name:"Save response",exact:true}).click();await expect(response.getByText("Saved",{exact:true})).toBeVisible();
  expect((await db.from("student_interview_answers").select("answer,audience").eq("firm_id",firm).eq("id",answer).single()).data).toEqual({answer:ownWords,audience:before.audience});
  await openAi(page);await expect(page.getByRole("article",{name:/^Needs more context:/})).toHaveCount(0);
 });
 test("counselor reviews a question and a story before saving; parent cannot read drafts",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,staffPath);await openAi(page);await page.getByLabel("Interview stage",{exact:true}).selectOption("2");
  const question=await generate(page,"questions",/^B1 ·/);await question.getByText("Review before saving",{exact:true}).click();await question.getByRole("button",{name:"Add counselor follow-up",exact:true}).click();await expect(question).toContainText("Saved for review");
  const story=await generate(page,"story",/^B1 ·/);await story.getByText("Review before saving",{exact:true}).click();await story.getByRole("textbox",{name:"Suggestion title",exact:true}).fill("A reviewed workshop story");await story.getByRole("button",{name:"Save story draft",exact:true}).click();await expect(story).toContainText("Saved for review");
  const saved=(await db.from("student_story_bank").select("id,audience,review_state").eq("firm_id",firm).eq("student_id",student).eq("title","A reviewed workshop story").single()).data!;storyId=saved.id;expect(saved).toMatchObject({audience:"counselor",review_state:"draft"});
  const context=await browser.newContext(),parent=await context.newPage();await signInAs(parent,emails.parent1,parentPath);await openAi(parent);expect(await parent.content()).not.toMatch(/A reviewed workshop story|PRIVATE SECOND|PRIVATE COUNSELOR|AI story suggestion/);await context.close();
 });
 test("counselor reviews a context-gap follow-up; the student independently chooses whether to share a reply",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,staffPath);await openAi(page);const card=await generateGap(page,"story",/^B1 ·/);
  await expect(card.getByRole("button",{name:"Save story draft",exact:true})).toHaveCount(0);
  const context=await browser.newContext(),portal=await context.newPage();await signInAs(portal,emails.parent1,parentPath);await openAi(portal);await expect(portal.getByRole("article",{name:/^Needs more context:/})).toHaveCount(0);
  await card.getByText("Review before saving",{exact:true}).click();const question="Which small detail from comparing those designs would you like to discuss?";
  await card.getByRole("textbox",{name:"Question to ask",exact:true}).fill(question);await card.getByRole("button",{name:"Add counselor follow-up",exact:true}).click();await expect(card).toContainText("Follow-up added");
  const followup=(await db.from("student_interview_followups").select("id,audience,source_answer_id").eq("firm_id",firm).eq("student_id",student).eq("question",question).single()).data!;
  expect(followup).toMatchObject({audience:"counselor",source_answer_id:answer});
  await portal.reload();await expect(portal.getByText(question,{exact:true})).toHaveCount(0);
  await context.close();const studentContext=await browser.newContext(),studentPage=await studentContext.newPage();await signInAs(studentPage,emails.student,"/student-interview");const reply=studentPage.locator(`#interview-followup-${followup.id}`);await reply.locator("summary").click();
  const ownWords="The order we compared them is the detail I want to discuss. I have not decided on a lesson.";
  await reply.getByRole("textbox",{name:"Your reply",exact:true}).fill(ownWords);await reply.getByLabel("Who can see this question and reply",{exact:true}).selectOption("family");await reply.getByRole("button",{name:"Send reply",exact:true}).click();await expect(reply.locator("summary")).toContainText("answered");await reply.locator("summary").click();await expect(reply.getByRole("paragraph").filter({hasText:ownWords})).toBeVisible();await expect(reply.getByRole("textbox",{name:"Your reply",exact:true})).toHaveValue(ownWords);
  await studentContext.close();const sharedContext=await browser.newContext(),sharedPage=await sharedContext.newPage();await signInAs(sharedPage,emails.parent1,parentPath);const shared=sharedPage.locator(`#interview-followup-${followup.id}`);await expect(shared).toContainText(question);await shared.locator("summary").click();await expect(shared.getByText(ownWords,{exact:true})).toBeVisible();await openAi(sharedPage);await expect(sharedPage.getByRole("article",{name:/^Needs more context:/})).toHaveCount(0);await sharedContext.close();
  expect((await db.from("student_story_bank").select("id",{count:"exact",head:true}).eq("firm_id",firm).eq("student_id",student)).count).toBe(1);
 });
 test("student confirms and shares the story, then develops an unconfirmed narrative",async({page})=>{
  await signInAs(page,emails.student,"/student-interview?view=bank");let card=page.getByRole("article",{name:"A reviewed workshop story",exact:true});await card.getByRole("button",{name:"Edit story",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByLabel("Does this feel accurate?",{exact:true}).selectOption("confirmed");await dialog.getByLabel("Who can see this item",{exact:true}).selectOption("family");await dialog.getByRole("button",{name:"Save changes",exact:true}).click();await expect(dialog).toHaveCount(0);
  await openAi(page);card=await generate(page,"narrative",/^Story · A reviewed workshop story$/);await card.getByText("Review before saving",{exact:true}).click();await card.getByRole("button",{name:"Save narrative draft",exact:true}).click();await expect(card).toContainText("Saved for review");
  const narrative=(await db.from("student_story_bank").select("story_ids,review_state,audience").eq("firm_id",firm).eq("student_id",student).eq("kind","narrative").single()).data;expect(narrative).toEqual({story_ids:[storyId],review_state:"draft",audience:"counselor"});
  await page.getByRole("button",{name:"Refresh context and suggestions",exact:true}).click();const gap=await generateGap(page,"narrative",/^Story · A reviewed workshop story$/);
  await expect(gap.getByRole("button",{name:"Save narrative draft",exact:true})).toHaveCount(0);await gap.getByRole("button",{name:"Review cited stories",exact:true}).click();await expect(page.getByRole("article",{name:"A reviewed workshop story",exact:true})).toBeVisible();
  expect((await db.from("student_story_bank").select("story_ids,review_state,audience").eq("firm_id",firm).eq("student_id",student).eq("kind","narrative").single()).data).toEqual(narrative);
 });
 test("strategy proposals use the existing counselor publication and student parent-consent flow",async({page,browser})=>{
  await signInAs(page,env!.counselorEmail,staffPath);await openAi(page);const card=await generate(page,"strategy",/^Story · A reviewed workshop story$/);await card.getByText("Review before saving",{exact:true}).click();await card.getByRole("button",{name:"Save counselor draft",exact:true}).click();await expect(card).toContainText("Saved for review");
  const brief=(await db.from("student_strategy_sections").select("id,publication_state,family_shared").eq("firm_id",firm).eq("student_id",student).eq("section_key","strengths").single()).data!;briefId=brief.id;expect(brief).toMatchObject({publication_state:"draft",family_shared:false});
  await page.getByRole("button",{name:"Open strategy brief",exact:true}).click();const section=page.getByRole("article",{name:"Strengths and experiences",exact:true});await section.getByRole("button",{name:"Edit section",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByLabel("Share this section with",{exact:true}).selectOption("shared");await dialog.getByRole("button",{name:"Save section",exact:true}).click();await expect(dialog).toHaveCount(0);
  const context=await browser.newContext(),portal=await context.newPage();await signInAs(portal,emails.student,"/student-interview?view=strategy");const review=portal.getByRole("article",{name:"Strengths and experiences",exact:true});await review.getByText("Review and parent sharing",{exact:true}).click();await review.getByLabel("Does this reflect your perspective?",{exact:true}).selectOption("accurate");await review.getByRole("checkbox",{name:/Allow my parents/}).check();await review.getByRole("button",{name:"Save my review",exact:true}).click();await expect(review.getByText("Student-approved · Shared with parents",{exact:true})).toBeVisible();await context.close();
 });
 test("narrative and strategy context gaps preserve existing reviewed work and offer only a reviewed question",async({page})=>{
  const before=(await db.from("student_strategy_sections").select("body,publication_state,student_review,family_shared,revision").eq("firm_id",firm).eq("id",briefId).single()).data!;
  const bankBefore=(await db.from("student_story_bank").select("id,body,review_state,audience,revision").eq("firm_id",firm).eq("student_id",student).order("id")).data!;
  await signInAs(page,env!.counselorEmail,staffPath);await openAi(page);
  for(const mode of ["narrative","strategy"] as const){
   const card=await generateGap(page,mode,/^Story · A reviewed workshop story$/);await expect(card.getByRole("button",{name:/Save .*draft|Append to counselor draft/})).toHaveCount(0);
   await card.getByText("Review before saving",{exact:true}).click();await expect(card.getByRole("button",{name:"Add counselor follow-up",exact:true})).toBeVisible();
  }
  expect((await db.from("student_strategy_sections").select("body,publication_state,student_review,family_shared,revision").eq("firm_id",firm).eq("id",briefId).single()).data).toEqual(before);
  expect((await db.from("student_story_bank").select("id,body,review_state,audience,revision").eq("firm_id",firm).eq("student_id",student).order("id")).data).toEqual(bankBefore);
 });
 test("each parent uses only their own interview plus shared student context; withdrawal hides derived output",async({browser})=>{
  for(const [email,own,other]of [[emails.parent1,privateOne,privateTwo],[emails.parent2,privateTwo,privateOne]]){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await signInAs(page,email,parentPath);await openAi(page);await expect(page.getByRole("option",{name:"Possible stories",exact:true})).toHaveCount(0);
   expect(await page.content()).toContain(own);expect(await page.content()).not.toContain(other);await expect(page.getByRole("checkbox",{name:/Strategy brief · Strengths/})).toBeVisible();
   await generate(page,"questions",/^Story · A reviewed workshop story$/);expect(JSON.stringify(provider.calls.at(-1))).not.toMatch(/PRIVATE|original_text|counselor_notes/);
   await page.screenshot({path:test.info().outputPath("ai-context-mobile.png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa"]).analyze()).violations).toEqual([]);await context.close();
  }
  await done(await db.from("student_story_bank").update({audience:"counselor",revision:3}).eq("firm_id",firm).eq("id",storyId));
  const context=await browser.newContext(),page=await context.newPage();await signInAs(page,emails.parent1,parentPath);await openAi(page);await expect(page.getByRole("article",{name:"AI questions suggestion",exact:true})).toHaveCount(0);expect(await page.content()).not.toContain("A reviewed workshop story");await context.close();
  expect((await db.from("student_strategy_sections").select("family_shared").eq("firm_id",firm).eq("id",briefId).single()).data?.family_shared).toBe(true); // source withdrawal, not a destructive rewrite
 });
 test("provider failure and source changes during generation preserve work and suppress stale output",async({page})=>{
  await signInAs(page,env!.counselorEmail,staffPath);await openAi(page);await page.getByLabel("Help with",{exact:true}).selectOption("story");await page.getByRole("checkbox",{name:/^B1 ·/}).check();provider.controls.fail=true;
  await page.getByRole("button",{name:"Ask for suggestions",exact:true}).click();await expect(page.getByRole("region",{name:"Interview assistance",exact:true}).getByRole("alert")).toContainText("AI assistance is unavailable");provider.controls.fail=false;
  provider.controls.beforeResponse=async()=>{await done(await db.from("student_interview_answers").update({answer:"Corrected while waiting",revision:4}).eq("firm_id",firm).eq("id",answer));};
  await page.getByRole("button",{name:"Ask for suggestions",exact:true}).click();await expect(page.getByRole("region",{name:"Interview assistance",exact:true}).getByRole("alert")).toContainText("AI assistance is unavailable");provider.controls.beforeResponse=null;
  await page.getByRole("button",{name:"Refresh context and suggestions",exact:true}).click();await expect(page.getByRole("article",{name:"AI story suggestion",exact:true})).toHaveCount(0);
  expect((await db.from("student_story_bank").select("body").eq("firm_id",firm).eq("id",storyId).single()).data?.body).toBe("The student repaired a workshop item with a friend.");
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath("ai-context-mobile.png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa"]).analyze()).violations).toEqual([]);
 });
 test("a source withdrawn during context-gap generation suppresses the question and preserves saved work",async({page})=>{
  await signInAs(page,env!.counselorEmail,staffPath);await openAi(page);await page.getByLabel("Help with",{exact:true}).selectOption("story");await page.getByRole("checkbox",{name:/^B1 ·/}).check();
  provider.controls.needsContext=true;provider.controls.beforeResponse=async()=>{await done(await db.from("student_interview_answers").update({answer:"Changed during context-gap generation",revision:5}).eq("firm_id",firm).eq("id",answer));};
  try{await page.getByRole("button",{name:"Ask for suggestions",exact:true}).click();await expect(page.getByRole("region",{name:"Interview assistance",exact:true}).getByRole("alert")).toContainText("AI assistance is unavailable");}finally{provider.controls.needsContext=false;provider.controls.beforeResponse=null;}
  await page.getByRole("button",{name:"Refresh context and suggestions",exact:true}).click();await expect(page.getByRole("article",{name:/^Needs more context:/})).toHaveCount(0);
  expect((await db.from("student_story_bank").select("body").eq("firm_id",firm).eq("id",storyId).single()).data?.body).toBe("The student repaired a workshop item with a friend.");
 });
});

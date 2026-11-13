import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs } from "./helpers/clerk";
import { e2eEnv } from "./helpers/env";

test.describe.serial("Annual prompt maintenance",()=>{
  test.use({ actionTimeout:20_000 });
  test.skip(!e2eEnv() || process.env.E2E_UX_REVIEW!=="1","Requires local preserved review identities");
  const firm="a0000000-0000-4000-8000-000000000001", sam="a0000000-0000-4000-8000-000000000041", counselor="a0000000-0000-4000-8000-000000000012";
  const catalog=randomUUID(), source=randomUUID(), prompt=randomUUID(), list=randomUUID();
  const name=`Annual ${randomUUID().slice(0,8)}`, privateNote=`Private evidence ${randomUUID()}`;
  const updatedTitle=`${name} revised story`, guidance=`${name} updated guidance`;
  let db:SupabaseClient, year:number, reviewId:string, draftId:string;
  test.beforeAll(async()=>{
    for(const url of [process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.E2E_BASE_URL??"http://localhost:3000"]) expect(new URL(url).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
    const student=await db.from("students").select("graduation_year").eq("firm_id",firm).eq("id",sam).single(); expect(student.error).toBeNull();year=student.data!.graduation_year;
    expect((await db.from("colleges").insert({id:catalog,name,slug:name.toLowerCase().replaceAll(" ","-"),scorecard_id:990000+Math.floor(Math.random()*9000)})).error).toBeNull();
    const college=await db.from("colleges").select("scorecard_id").eq("id",catalog).single();
    expect((await db.from("college_prompt_sets").insert({id:source,scorecard_id:college.data!.scorecard_id,college_name:name,entry_year:year,coverage:"verified",source_url:"https://example.edu/original",verified_on:new Date().toISOString().slice(0,10),notes:`${name} original guidance`})).error).toBeNull();
    expect((await db.from("college_library_prompts").insert({id:prompt,prompt_set_id:source,prompt_key:"story",title:`${name} original story`,prompt_text:"Describe an experience.",word_limit:250,requirement:"required"})).error).toBeNull();
    expect((await db.from("student_colleges").insert({id:list,firm_id:firm,student_id:sam,college_id:catalog,category:"target",created_by_user_id:counselor,updated_by_user_id:counselor})).error).toBeNull();
    const draft=await db.from("essay_drafts").select("id").eq("firm_id",firm).eq("student_college_id",list).single();expect(draft.error).toBeNull();draftId=draft.data!.id;
    expect((await db.from("essay_drafts").update({body:"Keep my original work",visibility_scope:"family",status:"in_review"}).eq("firm_id",firm).eq("id",draftId)).error).toBeNull();
  });
  test.afterAll(async()=>{
    if(!db)return;
    const essays=await db.from("essay_drafts").select("id").eq("firm_id",firm).eq("student_college_id",list);
    for(const e of essays.data??[]) {
      expect((await db.from("essay_draft_versions").delete().eq("essay_draft_id",e.id)).error).toBeNull();
      expect((await db.from("essay_drafts").delete().eq("firm_id",firm).eq("id",e.id)).error).toBeNull();
    }
    expect((await db.from("student_colleges").delete().eq("firm_id",firm).eq("id",list)).error).toBeNull();
    const sets=await db.from("college_prompt_sets").select("id").eq("college_name",name);
    for(const s of sets.data??[]) {
      expect((await db.from("college_prompt_review_evidence").delete().eq("firm_id",firm).eq("prompt_set_id",s.id)).error).toBeNull();
      expect((await db.from("college_library_prompts").delete().eq("prompt_set_id",s.id)).error).toBeNull();
      expect((await db.from("college_prompt_sets").delete().eq("id",s.id)).error).toBeNull();
    }
    expect((await db.from("colleges").delete().eq("id",catalog)).error).toBeNull();
  });
  test("counselor prepares and saves a reviewed draft without publication access",async({page})=>{
    await signInAs(page,"cw-ux-counselor+clerk_test@example.com","/essays/library/review");
    await page.getByRole("textbox",{name:"Search prompt reviews"}).fill(name);
    await page.getByRole("button",{name:"Start review",exact:true}).click();
    await expect(page).toHaveURL(/\/essays\/library\/review\/[a-f0-9-]+$/);reviewId=page.url().split("/").at(-1)!;
    await expect(page.getByLabel("Coverage",{exact:true})).toHaveValue("needs_review");
    await expect(page.getByLabel("Source checked on",{exact:true})).toHaveValue("");
    await page.getByLabel("Coverage",{exact:true}).selectOption("verified");
    await page.getByRole("textbox",{name:"Official source URL",exact:true}).fill("https://example.edu/current");
    await page.getByLabel("Source checked on",{exact:true}).fill(new Date().toISOString().slice(0,10));
    const due=new Date();due.setUTCDate(due.getUTCDate()+200);
    await page.getByLabel("Next review due",{exact:true}).fill(due.toISOString().slice(0,10));
    await page.getByLabel("Application guidance (visible to students and families)",{exact:true}).fill(guidance);
    await page.getByLabel("Review evidence and changes (staff only)",{exact:true}).fill(privateNote);
    await page.getByRole("textbox",{name:"Assignment title",exact:true}).fill(updatedTitle);
    await page.getByLabel("Maximum words (if specified)",{exact:true}).fill("300");
    await page.getByRole("button",{name:"Save review draft",exact:true}).click();
    await expect(page.getByText("Unsaved changes.",{exact:false})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Publish for my firm",exact:true})).toHaveCount(0);
    await expect(page.getByText("An owner or admin can publish this saved draft.",{exact:true})).toBeVisible();
    expect((await db.from("college_prompt_review_evidence").select("review_notes").eq("firm_id",firm).eq("prompt_set_id",reviewId).single()).data?.review_notes).toBe(privateNote);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    await page.screenshot({path:"/tmp/cw-prompt-review-mobile.png",fullPage:true});
    const axe=await new AxeBuilder({page}).include("main").analyze();expect(axe.violations).toEqual([]);
  });
  for(const persona of ["student","parent"] as const) test(`${persona} keeps published requirements while the new review is a draft`,async({page})=>{
    await signInAs(page,`cw-ux-${persona}+clerk_test@example.com`,`${persona==="student"?"/student-colleges/":"/family-colleges/"}${list}`);
    await expect(page.getByText(`${name} original guidance`,{exact:true})).toBeVisible();
    await expect(page.getByText(guidance,{exact:true})).toHaveCount(0);
    expect(await page.content()).not.toContain(privateNote);
    await page.goto(`/essays/library/review/${reviewId}`);await expect(page).not.toHaveURL(new RegExp(`/review/${reviewId}$`));
  });
  test("owner publishes the saved review, and reassigning preserves the existing draft",async({page})=>{
    await signInAs(page,"cw-ux-owner+clerk_test@example.com",`/essays/library/review/${reviewId}`);
    await expect(page.getByLabel("Review evidence and changes (staff only)",{exact:true})).toHaveValue(privateNote);
    await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Publish for my firm",exact:true}).click();
    await expect(page.getByText("This publication is preserved for your review history.",{exact:false})).toBeVisible();
    await page.goto(`/students/${sam}/colleges/${list}`);
    await expect(page.getByText(guidance,{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Assign required prompts",exact:true}).click();
    await expect.poll(async()=>{const r=await db.from("essay_drafts").select("id,body,word_count_limit,library_prompt_id,library_prompt_snapshot,status,visibility_scope").eq("firm_id",firm).eq("student_college_id",list);return r.data;}).toEqual([expect.objectContaining({id:draftId,body:"Keep my original work",word_count_limit:250,library_prompt_id:prompt,status:"in_review",visibility_scope:"family",library_prompt_snapshot:expect.objectContaining({source_url:"https://example.edu/original"})})]);
    const details=page.locator("details").filter({has:page.getByText(updatedTitle,{exact:false})});await details.locator("summary").click();
    await expect(details.getByRole("link",{name:"Open draft",exact:true})).toBeVisible();
    await expect(details.getByText("This draft keeps its original prompt and limits.",{exact:false})).toBeVisible();
  });
  for(const persona of ["student","parent"] as const) test(`${persona} sees the firm's published requirements and retains the shared original essay`,async({page})=>{
    await signInAs(page,`cw-ux-${persona}+clerk_test@example.com`,`${persona==="student"?"/student-colleges/":"/family-colleges/"}${list}`);
    await expect(page.getByText(guidance,{exact:true})).toBeVisible();
    expect(await page.content()).not.toContain(privateNote);
    const details=page.locator("details").filter({has:page.getByText(updatedTitle,{exact:false})});await details.locator("summary").click();
    await details.getByRole("link",{name:persona==="student"?"Open draft":"Read shared essay",exact:true}).click();
    await expect(page.getByText("Keep my original work",{exact:true})).toBeVisible();
  });
  test("annual copy resets verification and remains a draft in publication history",async({page})=>{
    await signInAs(page,"cw-ux-owner+clerk_test@example.com","/essays/library/review");
    await page.getByRole("textbox",{name:"Search prompt reviews"}).fill(name);
    await page.getByLabel("Review entry year",{exact:true}).fill(String(year+1));
    await page.getByRole("button",{name:"Start review",exact:true}).click();
    await expect(page.getByLabel("Coverage",{exact:true})).toHaveValue("needs_review");
    await expect(page.getByLabel("Source checked on",{exact:true})).toHaveValue("");
    await expect(page.getByLabel("Next review due",{exact:true})).toHaveValue("");
    await expect(page.getByRole("textbox",{name:"Assignment title",exact:true})).toHaveValue(updatedTitle);
    await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Publish for my firm",exact:true}).click();
    await expect(page.getByRole("alert").filter({hasText:"Publishing requires"})).toBeVisible();
  });
  test("verified program responses remain explicitly assignable with no general supplement",async({page})=>{
    await signInAs(page,"cw-ux-owner+clerk_test@example.com","/essays/library/review");
    await page.getByRole("textbox",{name:"Search prompt reviews"}).fill(name);
    await page.getByRole("button",{name:"Start review",exact:true}).click();
    await expect(page.getByLabel("Coverage",{exact:true})).toHaveValue("needs_review");
    await page.getByLabel("Coverage",{exact:true}).selectOption("no_supplement");
    await page.getByLabel("Source checked on",{exact:true}).fill(new Date().toISOString().slice(0,10));
    const due=new Date();due.setUTCDate(due.getUTCDate()+200);
    await page.getByLabel("Next review due",{exact:true}).fill(due.toISOString().slice(0,10));
    await page.getByLabel("Review evidence and changes (staff only)",{exact:true}).fill(`${privateNote} program verification`);
    await page.getByLabel("Who should answer?",{exact:true}).selectOption("conditional");
    await page.getByRole("button",{name:"Add response",exact:true}).click();
    await page.getByRole("textbox",{name:"Assignment title",exact:true}).nth(1).fill(`${name} program response`);
    await page.getByRole("textbox",{name:"Prompt or summary",exact:true}).nth(1).fill("Only for applicants to this specific program: explain your interest.");
    await page.getByLabel("Maximum words (if specified)",{exact:true}).nth(1).fill("100");
    await page.getByRole("button",{name:"Save review draft",exact:true}).click();
    await expect(page.getByText("Unsaved changes.",{exact:false})).toHaveCount(0);
    await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Publish for my firm",exact:true}).click();
    await expect(page.getByText("This publication is preserved for your review history.",{exact:false})).toBeVisible();
    await page.goto(`/students/${sam}/colleges/${list}`);
    await expect(page.getByText("No general supplement",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Assign required prompts",exact:true})).toHaveCount(0);
    const details=page.locator("details").filter({has:page.getByText(`${name} program response`,{exact:false})});
    await details.locator("summary").click();await details.getByRole("button",{name:"Assign conditional response",exact:true}).click();
    await expect(details.getByRole("link",{name:"Open draft",exact:true})).toBeVisible();
    await expect.poll(async()=>{const result=await db.from("essay_drafts").select("id").eq("firm_id",firm).eq("student_college_id",list);return result.data?.length;}).toBe(2);
    expect((await db.from("essay_drafts").select("body,word_count_limit").eq("firm_id",firm).eq("id",draftId).single()).data).toEqual({body:"Keep my original work",word_count_limit:250});
  });

});

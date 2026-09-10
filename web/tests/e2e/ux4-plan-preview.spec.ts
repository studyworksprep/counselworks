import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnv } from "./helpers/env";
import { signInAs } from "./helpers/clerk";

const sam="a0000000-0000-4000-8000-000000000041";
const student="a0000000-0000-4000-8000-000000000015";
const firm="a0000000-0000-4000-8000-000000000001";
const template=randomUUID(), prefix=`UX4 ${randomUUID().slice(0,8)}`;
const stepIds=Array.from({length:12},()=>randomUUID());
let db:SupabaseClient;
let assignedId:string;
test.use({actionTimeout:15_000});
test.describe.serial("UX4 scannable assignment",()=>{
  test.skip(!e2eEnv() || process.env.E2E_UX_REVIEW!=="1","Requires preserved local review identities");
  test.beforeAll(async()=>{
    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    expect(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
    expect((await db.from("workflow_templates").insert({id:template,firm_id:firm,name:prefix,workflow_type:"custom",is_active:true,instantiation_scope:"student"})).error).toBeNull();
    expect((await db.from("workflow_template_steps").insert(stepIds.map((id,i)=>({id,workflow_template_id:template,name:`${prefix} step ${i+1}`,step_order:i,step_type:"task",default_due_offset_days:i,default_assignee_role:i===1?"parent_guardian":i===2?"counselor":"student",visibility_scope:i===2?"staff":"family",description:"Original instructions"})))).error).toBeNull();
  });
  test.afterAll(async()=>{
    if(!db)return;
    const workflows=await db.from("student_workflows").select("id").eq("workflow_template_id",template).eq("firm_id",firm);
    for(const wf of workflows.data??[]){
      const steps=await db.from("student_workflow_steps").select("linked_task_id").eq("student_workflow_id",wf.id);
      expect((await db.from("student_workflows").delete().eq("id",wf.id).eq("firm_id",firm)).error).toBeNull();
      const tasks=(steps.data??[]).map(s=>s.linked_task_id).filter(Boolean);
      if(tasks.length)expect((await db.from("tasks").delete().in("id",tasks).eq("firm_id",firm)).error).toBeNull();
    }
    expect((await db.from("workflow_templates").delete().eq("id",template).eq("firm_id",firm)).error).toBeNull();
  });
  test("owner previews five steps on desktop and phone without creating a duplicate",async({page},info)=>{
    await signInAs(page,"cw-ux-owner+clerk_test@example.com",`/students/${sam}/tasks`);
    await page.locator('summary').filter({hasText:/^Apply plan$/}).click();
    await page.getByRole("combobox",{name:"Plan",exact:true}).selectOption({label:"Junior Year Anchors"});
    await page.getByRole("button",{name:"Preview plan",exact:true}).click();
    const preview=page.getByLabel("Plan preview",{exact:true});
    await expect(preview.locator("details")).toHaveCount(5);
    await expect(preview).toContainText("This plan already exists");
    for(const width of [1366,390]){
      await page.setViewportSize({width,height:844});
      await expect(preview.locator("details").first().locator("summary")).toContainText("Carl Counselman");
      await page.getByRole("button",{name:"Apply plan",exact:true}).scrollIntoViewIfNeeded();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:info.outputPath(`five-${width}.png`),fullPage:true});
    }
    await page.getByRole("button",{name:"Apply plan",exact:true}).click();
    const link=page.getByRole("link",{name:/View student's plan/});
    await expect(link).toBeVisible();
    const destination=(await link.getAttribute("href"))!;
    await link.click();
    await expect(page).toHaveURL(destination);
    await expect(page.locator(`#${destination.split('#')[1]}`)).toContainText("Junior Year Anchors");
  });
  test("counselor edits twelve steps, retains failures, saves and reuses actual instance",async({page},info)=>{
    await signInAs(page,"cw-ux-counselor+clerk_test@example.com",`/workflows/${template}`);
    await page.getByRole("button",{name:/Apply to Student/i}).click();
    const dialog=page.getByRole("dialog",{name:"Apply plan",exact:true});
    await dialog.getByRole("combobox",{name:"Student",exact:true}).selectOption(sam);
    await dialog.getByRole("button",{name:"Preview plan",exact:true}).click();
    await expect(dialog.locator("details")).toHaveCount(12);
    const first=dialog.locator("details").first();
    await first.locator("summary").focus();await page.keyboard.press("Enter");
    await first.getByRole("textbox",{name:"Title",exact:true}).fill("");
    await first.getByLabel("Owner",{exact:true}).selectOption("");
    await first.locator("summary").click();
    await expect(first.locator("summary")).toContainText("Check this step");
    await expect(first.locator("summary")).toContainText("Owner unresolved");
    await dialog.getByRole("button",{name:"Apply plan",exact:true}).click();
    await expect(dialog.getByRole("alert")).toContainText("Check the highlighted steps");
    await first.locator("summary").click();
    await first.getByRole("textbox",{name:"Title",exact:true}).fill(`${prefix} personalized`);
    await first.getByLabel("Owner",{exact:true}).selectOption(student);
    await first.getByLabel("Due date",{exact:true}).fill("2027-02-12");
    await first.getByRole("textbox",{name:"Instructions",exact:true}).fill("Personal instructions retained after retry");
    await first.getByLabel("Priority",{exact:true}).selectOption("high");
    await first.locator("summary").click();await first.locator("summary").click();
    await expect(first.getByRole("textbox",{name:"Instructions",exact:true})).toHaveValue("Personal instructions retained after retry");
    await first.locator("summary").click();
    for(const width of [1366,390]){
      await page.setViewportSize({width,height:844});
      for(const name of ["Apply plan","Back to selection","Cancel"]){
        const button=dialog.getByRole("button",{name,exact:true});await button.focus();
        const box=await button.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(844);
      }
      await page.keyboard.press("Tab");expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:info.outputPath(`twelve-${width}.png`)});
    }
    const axe=await new AxeBuilder({page}).include('[role="dialog"]').analyze();
    expect(axe.violations.filter(v=>["serious","critical"].includes(v.impact??""))).toEqual([]);
    // A transport failure before dispatch must retain edits and be safe to retry.
    await page.route('**/*',route=>route.request().method()==='POST' && route.request().headers()['next-action'] ? route.abort('failed') : route.continue());
    await dialog.getByRole("button",{name:"Apply plan",exact:true}).click();
    await expect(dialog.getByRole("alert")).toContainText("Your edits are still here");
    await page.unroute('**/*');
    await first.locator("summary").click();
    await expect(first.getByLabel("Due date",{exact:true})).toHaveValue("2027-02-12");
    await expect(first.getByLabel("Priority",{exact:true})).toHaveValue("high");
    await dialog.getByRole("button",{name:"Apply plan",exact:true}).click();
    const link=dialog.getByRole("link",{name:/View student's plan/});await expect(link).toBeVisible();
    assignedId=(await link.getAttribute("href"))!.split('#plan-')[1];
    const persisted=await db.from("student_workflow_steps").select("due_date,assigned_user_id,snapshot_json").eq("student_workflow_id",assignedId).eq("template_step_id",stepIds[0]).single();
    expect(persisted.error).toBeNull();expect(persisted.data).toMatchObject({due_date:"2027-02-12",assigned_user_id:student,snapshot_json:{title:`${prefix} personalized`,priority:"high",description:"Personal instructions retained after retry",dueSource:"manual"}});
    await link.click();await expect(page.locator(`#plan-${assignedId}`)).toContainText(`${prefix} personalized`);
    await page.goto(`/students/${sam}/tasks`);await page.locator('summary').filter({hasText:/^Apply plan$/}).click();
    await page.getByRole("combobox",{name:"Plan",exact:true}).selectOption(template);
    await page.getByRole("button",{name:"Preview plan",exact:true}).click();
    await page.getByRole("button",{name:"Apply plan",exact:true}).click();
    await expect(page.getByRole("link",{name:/View student's plan/})).toHaveAttribute("href",`/students/${sam}#plan-${assignedId}`);
    expect((await db.from("student_workflows").select("id").eq("workflow_template_id",template).eq("student_id",sam)).data).toHaveLength(1);
  });
  for(const role of ["student","parent"]){
    test(`${role} sees persisted family work and no private staff step`,async({page})=>{
      await signInAs(page,`cw-ux-${role}+clerk_test@example.com`,role==="student"?"/student-tasks":"/family-tasks");
      await expect(page.getByRole("link",{name:`${prefix} personalized`,exact:true})).toBeVisible();
      await expect(page.getByRole("link",{name:`${prefix} step 3`,exact:true})).toHaveCount(0);
      await page.getByRole("link",{name:`${prefix} personalized`,exact:true}).click();
      await expect(page.getByText("Personal instructions retained after retry",{exact:true})).toBeVisible();
    });
  }
});

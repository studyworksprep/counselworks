import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { e2eEnv } from "./helpers/env";
import { signInAs } from "./helpers/clerk";

// Only these generated rows are removed. Existing review fixtures are preserved.
test.describe.serial("UX3 role task semantics", () => {
  test.skip(!e2eEnv() || process.env.E2E_UX_REVIEW !== "1", "Requires local preserved review identities");
  const ids: string[] = [];
  const workflowId = randomUUID();
  const stepId = randomUUID();
  let db: SupabaseClient;
  let firmId: string;
  let counselor: string;
  let student: string;
  const sam = "a0000000-0000-4000-8000-000000000041";
  const prefix = `UX3 ${randomUUID().slice(0, 8)}`;
  const titles: Record<string, string> = {};
  const taskIds: Record<string, string> = {};
  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    expect(new URL(url).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: child, error } = await db.from("students").select("firm_id,user_id").eq("id", sam).single();
    expect(error).toBeNull(); firmId = child!.firm_id; student = child!.user_id;
    const { data: user } = await db.from("users").select("id").eq("email", "cw-ux-counselor+clerk_test@example.com").single();
    counselor = user!.id;
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const { error: workflowError } = await db.from("student_workflows").insert({id:workflowId,firm_id:firmId,student_id:sam,name:prefix,status:"in_progress",created_by_user_id:counselor});
    expect(workflowError).toBeNull();
    for (const kind of ["pending", "in_progress", "submitted", "changes_requested", "completed", "cancelled", "hidden", "archived", "other-reviewer", "weekly"]) {
      const id = randomUUID(); ids.push(id); taskIds[kind]=id; titles[kind]=`${prefix} ${kind}`;
      const status = ["hidden", "archived", "other-reviewer", "weekly"].includes(kind) ? (kind === "other-reviewer" ? "submitted" : "pending") : kind;
      const { error: insertError } = await db.from("tasks").insert({
        id, firm_id:firmId, student_id:sam,title:titles[kind],task_type:"general",status,
        assigned_user_id:kind === "weekly" ? counselor : student,
        owner_role:kind === "weekly" ? "counselor" : "student",owner_pending:false,
        visibility_scope:kind === "hidden" ? "staff" : "student",priority:"medium",
        completion_mode:status === "submitted" ? "review_required" : "simple",
        reviewer_user_id:kind === "submitted" ? counselor : null,
        due_at:tomorrow, archived_at:kind === "archived" ? new Date().toISOString() : null,
        created_by_user_id:counselor,updated_by_user_id:counselor,
      });
      expect(insertError).toBeNull();
    }
    const {data: templateStep} = await db.from("workflow_template_steps").select("id").limit(1).single();
    const {error: stepError} = await db.from("student_workflow_steps").insert({id:stepId,student_workflow_id:workflowId,template_step_id:templateStep!.id,title:titles.weekly,status:"pending",assigned_user_id:counselor,linked_task_id:taskIds.weekly,due_date:tomorrow.slice(0,10)});
    expect(stepError).toBeNull();
  });
  test.afterAll(async () => {
    if (!db) return;
    const generated = await db.from("student_workflow_steps").select("linked_task_id").eq("student_workflow_id", workflowId);
    for (const row of generated.data ?? []) if (row.linked_task_id && !ids.includes(row.linked_task_id)) ids.push(row.linked_task_id);
    const workflow = await db.from("student_workflows").delete().eq("firm_id", firmId).eq("id",workflowId);
    expect(workflow.error).toBeNull();
    if (ids.length) expect((await db.from("tasks").delete().eq("firm_id",firmId).in("id",ids)).error).toBeNull();
  });
  test("counselor review count, status filters, weekly destination and plan navigation", async ({page}) => {
    await signInAs(page,"cw-ux-counselor+clerk_test@example.com","/dashboard");
    const review = page.getByRole("link",{name:/^Needs review \(/});
    const count = Number((await review.innerText()).match(/\((\d+)\)/)![1]);
    await review.click();
    await expect(page.getByRole("link",{name:titles.submitted,exact:true})).toBeVisible();
    await expect(page.getByRole("link",{name:titles['other-reviewer'],exact:true})).toHaveCount(0);
    await expect(page.locator('main ul li')).toHaveCount(count);
    await page.getByRole("link",{name:titles.submitted,exact:true}).click();
    await expect(page.getByRole("button",{name:"Approve submission",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Retry workflow",exact:true})).toHaveCount(0);
    await page.goto("/tasks?view=team");
    await expect(page.getByRole("link",{name:`Needs review (${count})`,exact:true})).toBeVisible();
    for (const status of ["submitted","changes_requested","pending","in_progress","completed","cancelled"]) {
      await page.getByRole("combobox",{name:"Filter by status"}).selectOption(status);
      await expect(page.getByRole("link",{name:titles[status],exact:true})).toBeVisible();
      await expect(page.getByRole("link",{name:titles.archived,exact:true})).toHaveCount(0);
    }
    await page.goto("/dashboard");
    const weekly = page.getByRole("link",{name:/Workflow Steps This Week/});
    await expect(weekly).toContainText("1");
    await weekly.click();
    await expect(page).toHaveURL(/work=workflow-week/);
    await expect(page.getByRole("link",{name:titles.weekly,exact:true})).toBeVisible();
    await expect(page.getByRole("link",{name:titles.pending,exact:true})).toHaveCount(0);
    const {data: source} = await db.from("student_workflow_steps").select("template_step_id").eq("id",stepId).single();
    const missingId = randomUUID();
    expect((await db.from("student_workflow_steps").insert({id:missingId,student_workflow_id:workflowId,
      template_step_id:source!.template_step_id,title:`${prefix} recovered`,status:"pending",assigned_user_id:counselor,
      snapshot_json:{owner:counselor,ownerRole:"counselor",ownerReady:true,visibility:"staff",title:`${prefix} recovered`,completionMode:"simple",priority:"medium"}})).error).toBeNull();
    await page.goto(`/tasks/${taskIds.weekly}`);
    await page.getByRole("button",{name:"Retry workflow",exact:true}).click();
    await expect(page.getByRole("button",{name:"Retry workflow",exact:true})).toHaveCount(0);
    const {data: recovered} = await db.from("student_workflow_steps").select("linked_task_id").eq("id",missingId).single();
    expect(recovered!.linked_task_id).toBeTruthy();
    await page.getByRole("complementary",{name:"Main navigation"}).getByRole("link",{name:"Workflows",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Workflows",exact:true})).toBeVisible();
  });
  test("student dashboard separates personal work and hidden work; contextual link opens canonical task", async ({page},info) => {
    await signInAs(page,"cw-ux-student+clerk_test@example.com","/student-dashboard");
    await expect(page.getByRole("heading",{name:/My work \(showing/})).toBeVisible();
    await expect(page.getByRole("heading",{name:/Waiting on others \(showing/})).toBeVisible();
    for (const kind of ["hidden","archived","cancelled","completed"]) await expect(page.getByRole("link",{name:titles[kind],exact:true})).toHaveCount(0);
    await expect(page.getByRole("link",{name:/My open work 7/})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Waiting on others (showing 3 of 3)",exact:true})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:info.outputPath("student-dashboard-390.png"),fullPage:true});
    await page.goto(`/student-tasks/${taskIds.pending}`);
    await expect(page.getByRole("button",{name:"Mark complete",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Retry workflow",exact:true})).toHaveCount(0);
    await page.getByRole("link",{name:"Ask about this task",exact:true}).click();
    const reference=page.getByRole("link",{name:"Open referenced task",exact:true});
    await expect(reference).toHaveAttribute("href",`/task/${taskIds.pending}`);
    await reference.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading",{name:titles.pending,exact:true})).toBeVisible();
    await page.goto(`/student-messages?task=${taskIds.hidden}`);
    await expect(page.getByRole("link",{name:"Open referenced task",exact:true})).toHaveCount(0);
    await expect(page.getByRole("textbox").filter({hasText:titles.hidden})).toHaveCount(0);
  });
  test("parent keeps standalone reopening and College Lists navigation", async ({page}) => {
    await signInAs(page,"cw-ux-parent+clerk_test@example.com","/family-tasks");
    await page.getByRole("link",{name:"Review college budget with Sam",exact:true}).click();
    await expect(page.getByRole("button",{name:"Retry workflow",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Reopen task",exact:true})).toBeVisible();
    await page.getByRole("link",{name:"College Lists",exact:true}).click();
    await expect(page.getByRole("heading",{name:"College Lists",exact:true})).toBeVisible();
  });
});

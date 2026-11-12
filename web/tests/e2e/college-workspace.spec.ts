import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs } from "./helpers/clerk";
import { e2eEnv } from "./helpers/env";

// Opt-in acceptance against the preserved fictional identities. Setup/cleanup
// writes only generated local fixtures; the product journey uses real actions.
test.describe.serial("Connected college workspace", () => {
  test.use({ actionTimeout: 20_000 });
  test.skip(!e2eEnv() || process.env.E2E_UX_REVIEW !== "1", "Requires local preserved review identities");
  const firm = "a0000000-0000-4000-8000-000000000001";
  const sam = "a0000000-0000-4000-8000-000000000041";
  const counselor = "a0000000-0000-4000-8000-000000000012";
  const parent = "a0000000-0000-4000-8000-000000000013";
  const catalog = randomUUID(), set = randomUUID(), required = randomUUID(), optional = randomUUID(), conditional = randomUUID();
  const foreignFamily = randomUUID(), foreignStudent = randomUUID(), foreignList = randomUUID();
  const task = randomUUID(), studentTask = randomUUID(), hiddenTask = randomUUID();
  const prefix = `Connected ${randomUUID().slice(0, 8)}`;
  const requiredTitle = `${prefix} required story`, optionalTitle = `${prefix} optional short response`;
  const studentBody = "I built a small tool with my classmates and learned to ask better questions.";
  let db: SupabaseClient, list: string, app: string, draft: string, optionalDraft: string;

  test.beforeAll(async () => {
    for (const url of [process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.E2E_BASE_URL ?? "http://localhost:3000"]) {
      expect(new URL(url).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    }
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const child = await db.from("students").select("graduation_year, user_id").eq("id", sam).single();
    expect(child.error).toBeNull();
    const scorecard = 900000 + Math.floor(Math.random() * 90000);
    expect((await db.from("colleges").insert({ id: catalog, name: prefix, slug: prefix.toLowerCase().replaceAll(" ", "-"), scorecard_id: scorecard })).error).toBeNull();
    expect((await db.from("college_prompt_sets").insert({ id: set, scorecard_id: scorecard, college_name: prefix, entry_year: child.data!.graduation_year, coverage: "verified", source_url: "https://example.edu/admissions", verified_on: "2026-11-12", notes: "Fictional local acceptance fixture. Conditional response applies only to the named program." })).error).toBeNull();
    expect((await db.from("college_library_prompts").insert([
      { id: required, prompt_set_id: set, prompt_key: "required", title: requiredTitle, prompt_text: "Describe a project you built with other people.", word_limit: 250, requirement: "required", sort_order: 0 },
      { id: optional, prompt_set_id: set, prompt_key: "optional", title: optionalTitle, prompt_text: "What matters to you?", character_limit: 200, requirement: "optional", sort_order: 1 },
      { id: conditional, prompt_set_id: set, prompt_key: "conditional", title: `${prefix} program response`, prompt_text: "Only for applicants to the named program.", word_limit: 100, requirement: "conditional", sort_order: 2 },
    ])).error).toBeNull();
    expect((await db.from("families").insert({ id: foreignFamily, firm_id: firm, household_name: `${prefix} unrelated household`, created_by_user_id: counselor, updated_by_user_id: counselor })).error).toBeNull();
    expect((await db.from("students").insert({ id: foreignStudent, firm_id: firm, family_id: foreignFamily, first_name: "Unrelated", last_name: prefix, graduation_year: child.data!.graduation_year, created_by_user_id: counselor, updated_by_user_id: counselor })).error).toBeNull();
    expect((await db.from("student_staff_assignments").insert({ firm_id: firm, student_id: foreignStudent, user_id: counselor, assignment_type: "counselor", is_primary: true })).error).toBeNull();
    expect((await db.from("student_colleges").insert({ id: foreignList, firm_id: firm, student_id: foreignStudent, college_id: catalog, category: "target", created_by_user_id: counselor, updated_by_user_id: counselor })).error).toBeNull();
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.from("tasks").delete().in("id", [task, studentTask, hiddenTask]);
    await db.from("essay_drafts").delete().in("library_prompt_id", [required, optional, conditional]);
    await db.from("applications").delete().eq("college_id", catalog);
    await db.from("student_colleges").delete().eq("college_id", catalog);
    await db.from("students").delete().eq("id", foreignStudent);
    await db.from("families").delete().eq("id", foreignFamily);
    await db.from("college_library_prompts").delete().eq("prompt_set_id", set);
    await db.from("college_prompt_sets").delete().eq("id", set);
    await db.from("colleges").delete().eq("id", catalog);
  });

  test("counselor adds a college, assigns reviewed responses, and starts one application", async ({ page }, testInfo) => {
    await signInAs(page, "cw-ux-counselor+clerk_test@example.com", `/students/${sam}/colleges`);
    await page.getByRole("button", { name: "Add College", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('[name="college_id"]').selectOption(catalog);
    await dialog.locator('[name="category"]').selectOption("target");
    await dialog.getByRole("button", { name: "Add College", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("link", { name: prefix, exact: true }).click();
    await expect(page.getByTestId("college-workspace")).toBeVisible();
    list = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByRole("heading", { name: "Application", exact: true })).toBeVisible();
    let assigned = await db.from("essay_drafts").select("id").eq("student_id", sam).eq("library_prompt_id", required).single();
    expect(assigned.error).toBeNull(); draft = assigned.data!.id;
    expect((await db.from("essay_drafts").select("id").eq("student_id", sam).in("library_prompt_id", [optional, conditional])).data).toHaveLength(0);
    await page.getByRole("button", { name: "Assign required prompts", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("0 new assignments");
    await page.getByText(`${optionalTitle} · optional`, { exact: false }).first().click();
    await page.getByRole("button", { name: "Assign optional response", exact: true }).click();
    await expect(page.getByRole("status").last()).toContainText("1 new assignments");
    await page.getByRole("button", { name: "Start application", exact: true }).click();
    await expect(page.getByRole("link", { name: "Manage application & checklist", exact: true })).toBeVisible();
    const application = await db.from("applications").select("id").eq("student_college_id", list).single();
    expect(application.error).toBeNull(); app = application.data!.id;
    const essays = await db.from("essay_drafts").select("id, library_prompt_id, application_id").eq("student_college_id", list);
    expect(essays.data).toHaveLength(2); expect(essays.data!.every(e => e.application_id === app)).toBe(true);
    optionalDraft = essays.data!.find(e => e.library_prompt_id === optional)!.id;
    const child = await db.from("students").select("user_id").eq("id", sam).single();
    expect((await db.from("tasks").insert([
      { id: task, firm_id: firm, student_id: sam, application_id: app, task_type: "general", title: `${prefix} parent task`, owner_role: "parent_guardian", assigned_user_id: parent, owner_pending: false, visibility_scope: "family", created_by_user_id: counselor, updated_by_user_id: counselor },
      { id: studentTask, firm_id: firm, student_id: sam, related_entity_type: "essay", related_entity_id: draft, task_type: "general", title: `${prefix} student task`, owner_role: "student", assigned_user_id: child.data!.user_id, owner_pending: false, visibility_scope: "student", created_by_user_id: counselor, updated_by_user_id: counselor },
      { id: hiddenTask, firm_id: firm, student_id: sam, application_id: app, task_type: "general", title: `${prefix} private staff task`, owner_role: "counselor", assigned_user_id: counselor, owner_pending: false, visibility_scope: "staff", created_by_user_id: counselor, updated_by_user_id: counselor },
    ])).error).toBeNull();
    await page.reload();
    await expect(page.getByRole("link", { name: `${prefix} private staff task`, exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('[data-testid="college-workspace"]').analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("counselor-workspace.png"), fullPage: true });
    await page.getByRole("link", { name: "Manage application & checklist", exact: true }).click();
    await page.getByRole("link", { name: "College workspace", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/colleges/${list}$`));
    assigned = await db.from("essay_drafts").select("id").eq("student_id", sam).eq("library_prompt_id", required).single();
    expect(assigned.data!.id).toBe(draft);
  });

  test("student follows the college to a draft, saves writing, and submits for review", async ({ page }) => {
    await signInAs(page, "cw-ux-student+clerk_test@example.com", "/student-colleges");
    await page.getByRole("link", { name: prefix, exact: true }).click();
    await expect(page.getByRole("button", { name: /Assign|Start application/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: `${prefix} student task`, exact: true })).toBeVisible();
    await expect(page.getByText(`${prefix} private staff task`, { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: requiredTitle, exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Prompt source", exact: true })).toContainText("Prompt summary");
    await page.locator("textarea").first().fill(studentBody);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await page.getByRole("button", { name: "Submit for review", exact: true }).click();
    await expect(page.getByText("With your counselor", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to college workspace", exact: true }).click();
    await expect(page.getByTestId("college-workspace")).toContainText("With your counselor");
    await page.getByRole("link", { name: optionalTitle, exact: true }).click();
    await page.locator("textarea").first().fill("x".repeat(201));
    await expect(page.getByText("201 / 200 characters — over limit", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect.poll(async () => (await db.from("essay_drafts").select("body").eq("id", optionalDraft).single()).data?.body).toBe("x".repeat(201));
    await page.goto(`/student-colleges/${foreignList}`);
    await expect(page.getByTestId("college-workspace")).toHaveCount(0);
    await expect(page.getByText(requiredTitle, { exact: true })).toHaveCount(0);
  });

  test("parent sees the checklist and own task without private essay metadata or text", async ({ page }) => {
    await signInAs(page, "cw-ux-parent+clerk_test@example.com", "/family-applications");
    await page.getByRole("link", { name: prefix, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Shared essays", exact: true })).toBeVisible();
    await expect(page.getByText("No essays have been shared with your family for this college.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: requiredTitle, exact: true })).toHaveCount(0);
    await expect(page.getByText("With your counselor", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: `${prefix} student task`, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: `${prefix} private staff task`, exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: `${prefix} parent task`, exact: true }).click();
    await page.getByRole("button", { name: "Mark complete", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reopen task", exact: true })).toBeVisible();
    await page.goto(`/family-essays/${draft}`);
    await expect(page.getByText(studentBody, { exact: true })).toHaveCount(0);
    await page.goto(`/family-colleges/${foreignList}`);
    await expect(page.getByTestId("college-workspace")).toHaveCount(0);
  });

  test("counselor approves and shares one essay; parent gets a read-only view", async ({ browser }, testInfo) => {
    const staffContext = await browser.newContext(), familyContext = await browser.newContext();
    const staff = await staffContext.newPage(), family = await familyContext.newPage();
    try {
      await signInAs(staff, "cw-ux-counselor+clerk_test@example.com", `/essays/${draft}`);
      await expect(staff.locator("textarea").first()).toHaveValue(studentBody);
      await staff.getByLabel("Essay status", { exact: true }).selectOption("approved");
      await expect.poll(async () => (await db.from("essay_drafts").select("status").eq("id", draft).single()).data?.status).toBe("approved");
      await staff.getByLabel("Visible to", { exact: true }).selectOption("family");
      await expect.poll(async () => (await db.from("essay_drafts").select("visibility_scope").eq("id", draft).single()).data?.visibility_scope).toBe("family");
      await staff.getByRole("link", { name: "Back to college workspace", exact: true }).click();
      await expect(staff.getByText("1 of 2 approved or final", { exact: true })).toBeVisible();
      await staff.getByRole("button", { name: "Assign required prompts", exact: true }).click();
      await expect(staff.getByRole("status")).toContainText("0 new assignments");
      expect((await db.from("essay_drafts").select("body,status,visibility_scope").eq("id", draft).single()).data).toEqual({ body: studentBody, status: "approved", visibility_scope: "family" });
      await signInAs(family, "cw-ux-parent+clerk_test@example.com", `/family-colleges/${list}`);
      await family.getByRole("link", { name: requiredTitle, exact: true }).click();
      await expect(family.getByText(studentBody, { exact: true })).toBeVisible();
      await expect(family.getByRole("textbox")).toHaveCount(0);
      await expect(family.getByRole("button", { name: /Save|Submit|Approve/ })).toHaveCount(0);
      await family.getByRole("link", { name: "Back to college workspace", exact: true }).click();
      await expect(family.getByTestId("college-workspace")).toBeVisible();
      await family.setViewportSize({ width: 390, height: 844 });
      expect(await family.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page: family }).include('[data-testid="college-workspace"]').analyze();
      expect(results.violations).toEqual([]);
      await family.screenshot({ path: testInfo.outputPath("parent-workspace-mobile.png"), fullPage: true });
    } finally { await staffContext.close(); await familyContext.close(); }
  });
});

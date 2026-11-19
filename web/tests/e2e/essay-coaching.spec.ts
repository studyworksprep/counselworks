import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";
import { startInterviewAiProvider } from "./helpers/ai-provider";
const env = e2eEnv();
test.describe
  .serial("Saved-version coaching with selected student evidence", () => {
  test.skip(!env, "Requires Clerk development identities");
  const firm = "a0000000-0000-4000-8000-000000000001",
    counselor = "e2e00000-0000-4000-8000-000000000012";
  const student = randomUUID(),
    family = randomUUID(),
    studentUser = randomUUID(),
    parent1 = randomUUID(),
    parent2 = randomUUID(),
    answer = randomUUID(),
    bank = randomUUID(),
    essay = randomUUID(),
    version1 = randomUUID(),
    version2 = randomUUID();
  const suffix = process.env.E2E_INTERVIEW_SUFFIX || "finalreview20261116";
  const emails = {
    student: `e2e-student-interview-${suffix}+clerk_test@example.com`,
    parent1: `e2e-parent1-interview-${suffix}+clerk_test@example.com`,
    parent2: `e2e-parent2-interview-${suffix}+clerk_test@example.com`,
  };
  const original = "WORKING TEXT MUST NOT BE SENT TO SAVED COACHING",
    saved1 = "I tried a second design.\nThe seedlings survived.",
    saved2 = "A DIFFERENT SAVED VERSION, written later.",
    ownFeedback =
      "Which choice would I describe differently, and what do I remember about it?";
  let db: SupabaseClient,
    provider: Awaited<ReturnType<typeof startInterviewAiProvider>>,
    revisionTask: string;
  async function done(r: { error: unknown }) {
    expect(r.error).toBeNull();
  }
  async function coach(page: Page, number = 1) {
    await page
      .getByRole("button", { name: "Saved-version coaching", exact: true })
      .click();
    const d = page.getByRole("dialog", {
      name: "Saved-version essay coaching",
      exact: true,
    });
    await d
      .getByLabel("Saved draft version", { exact: true })
      .selectOption({ label: `Version ${number}` });
    await d
      .getByRole("button", { name: "Review version and context", exact: true })
      .click();
    await expect(
      d.getByText(`Reviewing saved version ${number}`, { exact: false }),
    ).toBeVisible();
    return d;
  }
  async function ask(page: Page) {
    const d = page.getByRole("dialog", {
        name: "Saved-version essay coaching",
        exact: true,
      }),
      b = d.getByRole("button", {
        name: "Ask for saved-version coaching",
        exact: true,
      });
    await b.click();
    await expect(b).toBeDisabled();
    await expect(b).toBeEnabled({ timeout: 60000 });
    return d;
  }
  test.beforeAll(async () => {
    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(
      /^(127\.0\.0\.1|localhost)$/,
    );
    expect(
      new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname,
    ).toMatch(/^(127\.0\.0\.1|localhost)$/);
    expect(process.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4319");
    provider = await startInterviewAiProvider();
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    for (const [kind, email] of Object.entries(emails))
      await ensureClerkUser(email, "Essay", kind);
    await done(
      await db.from("users").insert([
        {
          id: studentUser,
          email: emails.student,
          first_name: "Essay",
          last_name: "Student",
          auth_provider_user_id: `invited_essay_ai_student_${student}`,
        },
        {
          id: parent1,
          email: emails.parent1,
          first_name: "Essay",
          last_name: "Parent One",
          auth_provider_user_id: `invited_essay_ai_parent1_${student}`,
        },
        {
          id: parent2,
          email: emails.parent2,
          first_name: "Essay",
          last_name: "Parent Two",
          auth_provider_user_id: `invited_essay_ai_parent2_${student}`,
        },
      ]),
    );
    await done(
      await db.from("firm_memberships").insert([
        { firm_id: firm, user_id: studentUser, role: "student" },
        { firm_id: firm, user_id: parent1, role: "parent_guardian" },
        { firm_id: firm, user_id: parent2, role: "parent_guardian" },
      ]),
    );
    await done(
      await db.from("families").insert({
        id: family,
        firm_id: firm,
        household_name: `Essay AI household ${student}`,
        created_by_user_id: counselor,
        updated_by_user_id: counselor,
      }),
    );
    await done(
      await db.from("family_members").insert([
        {
          firm_id: firm,
          family_id: family,
          user_id: parent1,
          relationship_type: "parent",
        },
        {
          firm_id: firm,
          family_id: family,
          user_id: parent2,
          relationship_type: "parent",
        },
      ]),
    );
    await done(
      await db.from("students").insert({
        id: student,
        firm_id: firm,
        family_id: family,
        user_id: studentUser,
        first_name: "Essay",
        last_name: "Student",
        school_name: "Example High",
        graduation_year: 2027,
        created_by_user_id: counselor,
        updated_by_user_id: counselor,
      }),
    );
    await done(
      await db
        .from("student_profiles")
        .insert({ firm_id: firm, student_id: student }),
    );
    await done(
      await db.from("student_staff_assignments").insert({
        firm_id: firm,
        student_id: student,
        user_id: counselor,
        assignment_type: "counselor",
      }),
    );
    await done(
      await db.from("student_interview_answers").insert([
        {
          id: answer,
          firm_id: firm,
          student_id: student,
          respondent_user_id: studentUser,
          respondent_kind: "student",
          question_key: "B1",
          answer:
            "I repaired a workshop item with a friend and tried three designs.",
          state: "answered",
          audience: "counselor",
        },
        {
          firm_id: firm,
          student_id: student,
          id: randomUUID(),
          respondent_user_id: parent1,
          respondent_kind: "parent",
          question_key: "R1",
          answer: "PRIVATE PARENT VOICE",
          state: "answered",
          audience: "counselor",
        },
      ]),
    );
    await done(
      await db.from("student_story_bank").insert({
        id: bank,
        firm_id: firm,
        student_id: student,
        kind: "story",
        title: "A real workshop repair",
        body: "I tried three designs with a friend.",
        review_state: "confirmed",
        audience: "family",
        created_by_user_id: studentUser,
      }),
    );
    await done(
      await db.from("student_strategy_sections").insert({
        firm_id: firm,
        student_id: student,
        section_key: "counselor_notes",
        body: "PRIVATE COUNSELOR NOTES",
        publication_state: "draft",
        created_by_user_id: counselor,
        updated_by_user_id: counselor,
      }),
    );
    await done(
      await db.from("essay_drafts").insert({
        id: essay,
        firm_id: firm,
        student_id: student,
        essay_type: "supplemental",
        title: "A design decision",
        prompt_text: "Describe a decision that changed what you tried next.",
        body: original,
        status: "draft",
        word_count_limit: 250,
        visibility_scope: "family",
        created_by_user_id: counselor,
        updated_by_user_id: counselor,
      }),
    );
    await done(
      await db.from("essay_draft_versions").insert({
        id: version1,
        essay_draft_id: essay,
        version_number: 1,
        body: saved1,
        created_by_user_id: studentUser,
      }),
    );
    await done(
      await db.from("essay_draft_versions").insert({
        id: version2,
        essay_draft_id: essay,
        version_number: 2,
        body: saved2,
        created_by_user_id: studentUser,
      }),
    );
    await done(
      await db
        .from("essay_drafts")
        .update({ current_version_number: 2 })
        .eq("firm_id", firm)
        .eq("id", essay),
    );
  });
  test.afterAll(async () => {
    await provider?.close();
    if (!db) return;
    await done(
      await db
        .from("tasks")
        .delete()
        .eq("firm_id", firm)
        .eq("student_id", student),
    );
    await done(
      await db
        .from("essay_feedback")
        .delete()
        .eq("firm_id", firm)
        .eq("essay_draft_id", essay),
    );
    await done(
      await db
        .from("essay_coach_requests")
        .delete()
        .eq("firm_id", firm)
        .eq("student_id", student),
    );
    for (const table of [
      "essay_ai_requests",
      "student_essay_outlines",
      "student_essay_plans",
      "student_story_essay_links",
    ])
      await done(
        await db
          .from(table)
          .delete()
          .eq("firm_id", firm)
          .eq("student_id", student),
      );
    await done(
      await db
        .from("essay_drafts")
        .delete()
        .eq("firm_id", firm)
        .eq("student_id", student),
    );
    for (const table of [
      "student_strategy_sections",
      "student_interview_followups",
      "student_story_bank",
      "student_interview_answers",
      "student_interview_checkpoints",
      "student_staff_assignments",
      "student_profiles",
    ])
      await done(
        await db
          .from(table)
          .delete()
          .eq("firm_id", firm)
          .eq("student_id", student),
      );
    await done(
      await db.from("students").delete().eq("firm_id", firm).eq("id", student),
    );
    await done(
      await db
        .from("family_members")
        .delete()
        .eq("firm_id", firm)
        .eq("family_id", family),
    );
    await done(
      await db.from("families").delete().eq("firm_id", firm).eq("id", family),
    );
    await done(
      await db
        .from("firm_memberships")
        .delete()
        .eq("firm_id", firm)
        .in("user_id", [studentUser, parent1, parent2]),
    );
    await done(
      await db.from("users").delete().in("id", [studentUser, parent1, parent2]),
    );
  });

  test("counselor reviews an earlier saved version, edits cited feedback and assigns existing revision work", async ({
    page,
    browser,
  }) => {
    // A student who has written saved drafts already has a claimed account.
    // Claim through the real portal before assigning student-owned revision work.
    const studentContext = await browser.newContext(),
      studentPage = await studentContext.newPage();
    await signInAs(studentPage, emails.student, `/student-essays/${essay}`);
    await expect(
      studentPage.getByRole("heading", {
        name: "A design decision",
        exact: true,
      }),
    ).toBeVisible();
    await studentContext.close();
    await signInAs(page, env!.counselorEmail, `/essays/${essay}`);
    const d = await coach(page);
    await expect(d).toContainText(
      "An earlier version; latest saved version is 2",
    );
    await expect(d).not.toContainText("PRIVATE PARENT VOICE");
    await expect(d).not.toContainText("PRIVATE COUNSELOR NOTES");
    await d
      .getByRole("checkbox", {
        name: "Story · A real workshop repair",
        exact: true,
      })
      .check();
    await ask(page);
    const call = provider.calls.at(-1)!;
    expect(call.feature).toBe("saved_version_essay_coaching");
    expect(call.savedVersion).toEqual({
      id: version1,
      number: 1,
      body: saved1,
    });
    expect(call.sources.map((s) => s.key)).toEqual([`bank:${bank}`]);
    expect(JSON.stringify(call)).not.toContain(original);
    expect(JSON.stringify(call)).not.toContain(saved2);
    expect(JSON.stringify(call)).not.toContain("PRIVATE PARENT");
    await expect(d.locator("blockquote")).toContainText(
      "I tried a second design.",
    );
    await expect(
      d.getByRole("link", {
        name: "Story · A real workshop repair",
        exact: true,
      }),
    ).toHaveAttribute("href", new RegExp(`${bank}$`));
    await d
      .getByRole("button", { name: "Review and edit feedback", exact: true })
      .click();
    await d.getByLabel("Feedback to add", { exact: true }).fill(ownFeedback);
    await d
      .getByRole("button", { name: "Add reviewed feedback", exact: true })
      .click();
    await expect(d.getByRole("status")).toContainText(
      "Reviewed feedback added",
    );
    await d.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText(ownFeedback, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Reviewed coaching citations")).toContainText(
      "saved version 1",
    );
    await page
      .getByRole("button", { name: "Create revision task", exact: true })
      .click();
    const task = page.getByRole("dialog", {
      name: "Assign essay revision",
      exact: true,
    });
    await task
      .getByRole("textbox", { name: /^Revision task title/ })
      .fill("Explore the saved choice");
    await task
      .getByRole("textbox", { name: /^Revision instructions/ })
      .fill("Choose the details and write the revision yourself.");
    await task
      .getByRole("button", { name: "Assign revision task", exact: true })
      .click();
    await expect(task).toHaveCount(0);
    const r = await db
      .from("tasks")
      .select("id")
      .eq("firm_id", firm)
      .eq("student_id", student)
      .not("essay_feedback_id", "is", null)
      .single();
    await done(r);
    revisionTask = r.data!.id;
    const f = await db
      .from("essay_feedback")
      .select("body,version_number,quoted_text,ai_source_refs")
      .eq("firm_id", firm)
      .eq("essay_draft_id", essay)
      .single();
    await done(f);
    expect(f.data).toMatchObject({
      body: ownFeedback,
      version_number: 1,
      quoted_text: "I tried a second design.",
    });
    expect(f.data!.ai_source_refs).toHaveLength(1);
  });
  test("student sees reviewed feedback, keeps personal coaching private, and both parents see only shared writing", async ({
    page,
    browser,
  }) => {
    await signInAs(page, emails.student, `/student-essays/${essay}`);
    await expect(page.getByText(ownFeedback, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open revision task", exact: true }),
    ).toHaveAttribute("href", `/student-tasks/${revisionTask}`);
    const d = await coach(page, 2);
    await expect(d.getByLabel("Private coaching suggestions")).toHaveCount(0);
    await d.getByRole("checkbox", { name: /^B1 ·/ }).check();
    await ask(page);
    await expect(d.locator("blockquote")).toContainText(saved2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(
      axe.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: "/tmp/cw-coaching-student.png",
      fullPage: true,
    });
    await d.getByRole("button", { name: "Close", exact: true }).click();
    // A deliberate Save Draft creates the next snapshot; coaching then offers
    // that saved version without substituting it into an already-open review.
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(
      page
        .getByLabel("Later saved version", { exact: true })
        .locator("option")
        .filter({ hasText: /^Version 3$/ }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Saved-version coaching", exact: true })
      .click();
    const latest = await db
      .from("essay_draft_versions")
      .select("id,body")
      .eq("essay_draft_id", essay)
      .eq("version_number", 3)
      .single();
    await done(latest);
    expect(latest.data!.body).toBe(original);
    await expect(
      d.getByLabel("Saved draft version", { exact: true }),
    ).toHaveValue(latest.data!.id);
    await d
      .getByRole("button", { name: "Review version and context", exact: true })
      .click();
    await expect(
      d.getByText("Reviewing saved version 3", { exact: false }),
    ).toBeVisible();
    await d.getByRole("button", { name: "Close", exact: true }).click();
    for (const email of [emails.parent1, emails.parent2]) {
      const c = await browser.newContext(),
        p = await c.newPage();
      await signInAs(p, email, `/family-essays/${essay}`);
      await expect(
        p.getByText("Shared with your family · Read only", { exact: true }),
      ).toBeVisible();
      await expect(p.getByText(original, { exact: true })).toBeVisible();
      await expect(
        p.getByRole("button", { name: "Saved-version coaching", exact: true }),
      ).toHaveCount(0);
      await expect(p.getByText(ownFeedback, { exact: true })).toHaveCount(0);
      await expect(p.getByText(saved1, { exact: true })).toHaveCount(0);
      await expect(
        p.getByRole("heading", { name: "Feedback", exact: true }),
      ).toHaveCount(0);
      await c.close();
    }
  });
  test("source changes preserve refused review edits, provider failures preserve writing, and in-flight withdrawal suppresses output", async ({
    page,
  }) => {
    await signInAs(page, env!.counselorEmail, `/essays/${essay}`);
    let d = await coach(page);
    await d
      .getByRole("checkbox", {
        name: "Story · A real workshop repair",
        exact: true,
      })
      .check();
    await ask(page);
    await d
      .getByRole("button", { name: "Review and edit feedback", exact: true })
      .first()
      .click();
    await d
      .getByLabel("Feedback to add", { exact: true })
      .fill("KEEP MY UNSAVED REVIEW EDITS");
    await done(
      await db
        .from("student_story_bank")
        .update({ review_state: "revisit", revision: 2 })
        .eq("firm_id", firm)
        .eq("id", bank),
    );
    await d
      .getByRole("button", { name: "Add reviewed feedback", exact: true })
      .click();
    await expect(d.getByRole("alert")).toContainText("context changed");
    await expect(d.getByLabel("Feedback to add", { exact: true })).toHaveValue(
      "KEEP MY UNSAVED REVIEW EDITS",
    );
    await d.getByRole("button", { name: "Close", exact: true }).click();
    await d
      .getByRole("button", { name: "Discard review edits", exact: true })
      .click();
    await d.getByRole("button", { name: "Close", exact: true }).click();
    await done(
      await db
        .from("student_story_bank")
        .update({ review_state: "confirmed", revision: 3 })
        .eq("firm_id", firm)
        .eq("id", bank),
    );
    d = await coach(page);
    await d
      .getByRole("checkbox", {
        name: "Story · A real workshop repair",
        exact: true,
      })
      .check();
    provider.controls.fail = true;
    await ask(page);
    await expect(d.getByRole("alert")).toContainText("Coaching is unavailable");
    provider.controls.fail = false;
    provider.controls.beforeResponse = async () => {
      await done(
        await db
          .from("student_story_bank")
          .delete()
          .eq("firm_id", firm)
          .eq("id", bank),
      );
    };
    await ask(page);
    provider.controls.beforeResponse = null;
    await expect(d.getByRole("alert")).toContainText("Coaching is unavailable");
    await expect(d.getByLabel("Private coaching suggestions")).toHaveCount(0);
    const e = await db
      .from("essay_drafts")
      .select("body,current_version_number,status,visibility_scope")
      .eq("firm_id", firm)
      .eq("id", essay)
      .single();
    await done(e);
    expect(e.data).toMatchObject({
      body: original,
      current_version_number: 3,
      status: "draft",
      visibility_scope: "family",
    });
  });
  test("withdrawn context hides derived student feedback and revision work across detail, lists and dashboard", async ({
    page,
  }) => {
    await signInAs(page, emails.student, `/student-essays/${essay}`);
    await expect(page.getByText(ownFeedback, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Open revision task", exact: true }),
    ).toHaveCount(0);
    await page.goto("/student-tasks");
    await expect(
      page.getByText("Explore the saved choice", { exact: true }),
    ).toHaveCount(0);
    await page.goto("/student-dashboard");
    await expect(
      page.getByRole("link", { name: /^My open work 0/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Explore the saved choice", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`/student-tasks/${revisionTask}`);
    await expect(
      page.getByRole("heading", {
        name: "Explore the saved choice",
        exact: true,
      }),
    ).toHaveCount(0);
  });
});

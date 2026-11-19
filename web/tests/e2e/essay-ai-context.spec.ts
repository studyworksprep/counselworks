import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";
import { startInterviewAiProvider } from "./helpers/ai-provider";

const env = e2eEnv();
test.describe.serial("Grounded story matches and connected outlines", () => {
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
    essay = randomUUID();
  const suffix = process.env.E2E_INTERVIEW_SUFFIX || "finalreview20261116";
  const emails = {
    student: `e2e-student-interview-${suffix}+clerk_test@example.com`,
    parent1: `e2e-parent1-interview-${suffix}+clerk_test@example.com`,
    parent2: `e2e-parent2-interview-${suffix}+clerk_test@example.com`,
  };
  const ownAngle = "Which real workshop decision changed my next attempt?",
    ownPurpose = "Which details do I want to explore myself?",
    original = "STUDENT ORIGINAL WRITING stays in the student’s own words.";
  let db: SupabaseClient,
    provider: Awaited<ReturnType<typeof startInterviewAiProvider>>;
  async function done(result: { error: unknown }) {
    expect(result.error).toBeNull();
  }
  async function ai(page: Page) {
    await page
      .getByRole("button", { name: "AI essay planning", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "AI essay planning",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Review essay context", exact: true })
      .click();
    await expect(
      dialog.getByLabel("Planning help", { exact: true }),
    ).toBeVisible();
    return dialog;
  }
  async function ask(page: Page) {
    const dialog = page.getByRole("dialog", {
      name: "AI essay planning",
      exact: true,
    });
    const button = dialog.getByRole("button", {
      name: "Ask for planning suggestions",
      exact: true,
    });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toBeEnabled({ timeout: 60000 });
    return dialog;
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
        essay_draft_id: essay,
        version_number: 1,
        body: original,
        created_by_user_id: studentUser,
      }),
    );
  });
  test.afterAll(async () => {
    await provider?.close();
    if (!db) return;
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
  test("counselor selects context, cites a real story and reviews an editable private plan", async ({
    page,
  }) => {
    await signInAs(
      page,
      env!.counselorEmail,
      `/students/${student}/essays/planning`,
    );
    const dialog = await ai(page);
    await expect(dialog).toContainText("It does not write your essay");
    await dialog
      .getByRole("checkbox", { name: /^Story · A real workshop repair/ })
      .check();
    await dialog.getByRole("checkbox", { name: /^B1 ·/ }).check();
    await ask(page);
    const card = dialog.getByRole("article", {
      name: "Explore a real design decision",
      exact: true,
    });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("link", { name: /Story · A real workshop repair/ }),
    ).toHaveAttribute("href", new RegExp(bank));
    const call = provider.calls.at(-1)!;
    expect(call.sources).toHaveLength(2);
    expect(JSON.stringify(call)).not.toMatch(
      /PRIVATE PARENT|PRIVATE COUNSELOR|STUDENT ORIGINAL WRITING/,
    );
    await card
      .getByRole("button", {
        name: "Review and edit before saving",
        exact: true,
      })
      .click();
    await card
      .getByRole("textbox", { name: "Response angle to save", exact: true })
      .fill(ownAngle);
    await card
      .getByRole("button", {
        name: "Save as private response plan",
        exact: true,
      })
      .click();
    await expect(dialog).toContainText("Saved as a private draft");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText(ownAngle, { exact: true })).toBeVisible();
    const plan = (
      await db
        .from("student_essay_plans")
        .select("review_state,family_shared,ai_source_refs")
        .eq("firm_id", firm)
        .eq("essay_id", essay)
        .single()
    ).data!;
    expect(plan).toMatchObject({ review_state: "draft", family_shared: false });
    expect(plan.ai_source_refs).toHaveLength(2);
    expect(
      (
        await db
          .from("student_story_essay_links")
          .select("entry_id")
          .eq("firm_id", firm)
          .eq("essay_id", essay)
      ).data,
    ).toEqual([{ entry_id: bank }]);
  });
  test("student reviews citations and separately approves parent access after source sharing", async ({
    page,
    browser,
  }) => {
    await signInAs(page, emails.student, "/student-essays/planning");
    await page.getByRole("button", { name: "Edit plan", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Plan review", { exact: true })
      .selectOption("confirmed");
    await expect(
      dialog.getByRole("checkbox", { name: /Allow my parents/ }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Save plan", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    for (const email of [emails.parent1, emails.parent2]) {
      const c = await browser.newContext(),
        p = await c.newPage();
      await signInAs(p, email, `/family-essay-planning/${student}`);
      await expect(
        p.getByRole("button", { name: "AI essay planning", exact: true }),
      ).toHaveCount(0);
      expect(await p.content()).not.toContain(ownAngle);
      await c.close();
    }
    await done(
      await db
        .from("student_interview_answers")
        .update({ audience: "family", revision: 2 })
        .eq("firm_id", firm)
        .eq("id", answer),
    );
    await page.reload();
    await page.getByRole("button", { name: "Edit plan", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", {
        name: "Review updated cited context",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Use reviewed source versions",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("button", {
        name: "Use reviewed source versions",
        exact: true,
      })
      .click();
    await dialog.getByRole("checkbox", { name: /Allow my parents/ }).check();
    await dialog
      .getByRole("button", { name: "Save plan", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const link = page.getByRole("link", { name: /^B1 ·/ });
    await link.click();
    await expect(page.locator('form[data-question="B1"]')).toBeVisible();
  });
  test("student builds and edits a connected outline, then independently reviews and shares it", async ({
    page,
    browser,
  }) => {
    await signInAs(page, emails.student, `/student-essays/${essay}`);
    let dialog = await ai(page);
    await dialog
      .getByLabel("Planning help", { exact: true })
      .selectOption("outline");
    await expect(
      dialog.getByRole("checkbox", { name: /^Story · A real workshop repair/ }),
    ).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: /^B1 ·/ })).toBeChecked();
    await ask(page);
    const card = dialog.getByRole("article", {
      name: "Suggested connected outline",
      exact: true,
    });
    await expect(card).toBeVisible();
    await card
      .getByRole("button", {
        name: "Review and edit before saving",
        exact: true,
      })
      .click();
    await card
      .getByRole("textbox", { name: "Outline purpose to save", exact: true })
      .fill(ownPurpose);
    await card
      .getByRole("textbox", {
        name: "Questions and planning notes",
        exact: true,
      })
      .first()
      .fill(
        "Which design choice do I remember most clearly? I will choose the details myself.",
      );
    await card
      .getByRole("button", { name: "Save as private outline", exact: true })
      .click();
    await expect(dialog).toContainText("Saved as a private draft");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    const saved = (
      await db
        .from("student_essay_outlines")
        .select("review_state,family_shared,content,ai_source_refs")
        .eq("firm_id", firm)
        .eq("essay_id", essay)
        .single()
    ).data!;
    expect(saved).toMatchObject({
      review_state: "draft",
      family_shared: false,
      content: { purpose: ownPurpose },
    });
    expect(saved.content.beats[0].entry_ids).toEqual([bank]);
    expect(saved.ai_source_refs).toHaveLength(2);
    await page
      .getByRole("button", { name: "Edit outline", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Outline review", { exact: true })
      .selectOption("confirmed");
    await dialog.getByRole("checkbox", { name: /Allow my parents/ }).check();
    await dialog
      .getByRole("button", { name: "Save outline", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    for (const email of [emails.parent1, emails.parent2]) {
      const c = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        p = await c.newPage();
      await signInAs(p, email, `/family-essays/${essay}`);
      await expect(p.getByText(ownPurpose, { exact: true })).toBeVisible();
      await expect(p.getByText(ownAngle, { exact: true })).toBeVisible();
      await expect(
        p.getByRole("button", { name: "AI essay planning", exact: true }),
      ).toHaveCount(0);
      expect(await p.content()).not.toMatch(
        /PRIVATE PARENT|PRIVATE COUNSELOR|Explore a real design decision/,
      );
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page: p })
            .withTags(["wcag2a", "wcag2aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await p.screenshot({
        path: test.info().outputPath("parent-cited-outline-mobile.png"),
        fullPage: true,
      });
      await c.close();
    }
    expect(
      (
        await db
          .from("essay_drafts")
          .select("body,current_version_number,status")
          .eq("firm_id", firm)
          .eq("id", essay)
          .single()
      ).data,
    ).toMatchObject({
      body: original,
      current_version_number: 1,
      status: "draft",
    });
  });
  test("stale saves and provider failure retain review edits; in-flight source withdrawal suppresses output", async ({
    page,
    browser,
  }) => {
    await signInAs(page, emails.student, `/student-essays/${essay}`);
    let dialog = await ai(page);
    await dialog
      .getByLabel("Planning help", { exact: true })
      .selectOption("outline");
    await ask(page);
    const card = dialog.getByRole("article", {
      name: "Suggested connected outline",
      exact: true,
    });
    await expect(card).toBeVisible();
    await card
      .getByRole("button", {
        name: "Review and edit before saving",
        exact: true,
      })
      .click();
    await card
      .getByRole("textbox", { name: "Outline purpose to save", exact: true })
      .fill("UNSAVED REVIEW TO RETAIN");
    await done(
      await db
        .from("essay_drafts")
        .update({ prompt_text: "Describe a different decision." })
        .eq("firm_id", firm)
        .eq("id", essay),
    );
    await card
      .getByRole("button", { name: "Save as private outline", exact: true })
      .click();
    await expect(card.getByRole("alert")).toContainText("no longer available");
    await expect(
      card.getByRole("textbox", {
        name: "Outline purpose to save",
        exact: true,
      }),
    ).toHaveValue("UNSAVED REVIEW TO RETAIN");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      dialog.getByText("Your review edits have not been saved.", {
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Discard review edits", exact: true })
      .click();
    dialog = await ai(page);
    await dialog
      .getByRole("checkbox", { name: /^Story · A real workshop repair/ })
      .check();
    await dialog.getByRole("checkbox", { name: /^B1 ·/ }).check();
    provider.controls.fail = true;
    await ask(page);
    await expect(dialog.getByRole("alert")).toContainText(
      "Essay assistance is unavailable",
    );
    provider.controls.fail = false;
    let withdrawn = false;
    provider.controls.beforeResponse = async () => {
      await done(
        await db
          .from("student_interview_answers")
          .update({ audience: "counselor", revision: 3 })
          .eq("firm_id", firm)
          .eq("id", answer),
      );
      withdrawn = true;
    };
    await ask(page);
    await expect(dialog.getByRole("alert")).toContainText(
      "Essay assistance is unavailable",
    );
    expect(withdrawn).toBe(true);
    provider.controls.beforeResponse = null;
    await expect(dialog.getByRole("article")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath("student-ai-context-mobile.png"),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await done(
      await db
        .from("student_story_bank")
        .update({ review_state: "revisit", revision: 2 })
        .eq("firm_id", firm)
        .eq("id", bank),
    );
    await page.reload();
    await expect(page.getByText(ownAngle, { exact: true })).toBeVisible();
    await expect(page.getByText(ownPurpose, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Edit outline", exact: true })
      .click();
    const privateEdit = page.getByRole("dialog");
    await expect(
      privateEdit.getByRole("checkbox", { name: /Allow my parents/ }),
    ).toBeDisabled();
    await privateEdit
      .getByRole("button", { name: "Save outline", exact: true })
      .click();
    await expect(privateEdit).toHaveCount(0);
    for (const email of [emails.parent1, emails.parent2]) {
      const c = await browser.newContext(),
        p = await c.newPage();
      await signInAs(p, email, `/family-essays/${essay}`);
      expect(await p.content()).not.toContain(ownAngle);
      expect(await p.content()).not.toContain(ownPurpose);
      await c.close();
    }
    expect(
      (
        await db
          .from("essay_drafts")
          .select("body")
          .eq("firm_id", firm)
          .eq("id", essay)
          .single()
      ).data?.body,
    ).toBe(original);
  });
});

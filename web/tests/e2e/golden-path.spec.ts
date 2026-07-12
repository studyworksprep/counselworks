import {
  test,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";

/**
 * The golden-path acceptance scenario from docs/FIX_PLAN.md §1 — live
 * (fix plan 7.10). One serial scenario: an owner hands a bare assignment to
 * a counselor, who runs the full client journey against a real app, a real
 * database, and real Clerk dev-instance sessions.
 *
 * Environment contract (docs/E2E.md):
 *   - E2E_BASE_URL points at a running app whose database has the two-firm
 *     fixtures (supabase/seed/test-fixtures.sql) AND the E2E staff logins
 *     (supabase/seed/e2e-users.sql) applied.
 *   - CLERK_SECRET_KEY + publishable key of a Clerk DEV instance.
 *   - Personas are provisioned via the Clerk Backend API (idempotent) and
 *     signed in with ticket-based test auth; portal invitees are linked to
 *     their invited_ placeholders by the app's email claim path.
 *
 * The suite self-skips when Clerk keys are absent so `npm run test:e2e`
 * stays green on unconfigured machines and in CI until secrets land.
 *
 * Deviations from the prose scenario, by design:
 *   - Step 7 asserts the in-app exchange, not the notification email
 *     (Resend delivery is not observable from the browser).
 *   - Step 10 exercises the review-status loop; the AI coach review call is
 *     excluded to keep CI deterministic and key-free.
 *   - Step 12 asserts browser-level route denials; row-level isolation is
 *     enforced by supabase/tests/isolation.sql + tests/unit/authorize.test.ts
 *     in the same CI run.
 */

const env = e2eEnv();

// Run-unique data so the suite can re-run against the same database.
const runId = Date.now().toString(36);
const household = `E2E Household ${runId}`;
const studentFirst = "Golden";
const studentLast = `Path${runId}`;
const studentName = `${studentFirst} ${studentLast}`;
const gradYear = String(new Date().getFullYear() + 2); // 10th grader

const inviteDomain = env?.inviteDomain ?? "example.com";
const studentEmail = `e2e-student-${runId}+clerk_test@${inviteDomain}`;
const parent1Email = `e2e-parent1-${runId}+clerk_test@${inviteDomain}`;
const parent2Email = `e2e-parent2-${runId}+clerk_test@${inviteDomain}`;
const parent1Name = `Pat Parent${runId}`;
const parent2Name = `Quinn Parent${runId}`;

const collegeListEntries = [
  { search: "Harvard", category: "reach", round: "rea" },
  { search: "University of Massachusetts", category: "safety", round: "rd" },
  { search: "Boston University", category: "target", round: "ed" },
];

test.describe.serial("golden path: signed family → final decision", () => {
  test.skip(!env, "Clerk test-auth env not configured — see docs/E2E.md");

  let ownerCtx: BrowserContext;
  let counselorCtx: BrowserContext;
  let studentCtx: BrowserContext;
  let parent1Ctx: BrowserContext;
  let parent2Ctx: BrowserContext;
  let owner: Page;
  let counselor: Page;
  let student: Page;
  let parent1: Page;
  let parent2: Page;

  // Cross-step state.
  let familyId = "";
  let studentId = "";
  let applicationId = "";
  let essayId = "";

  test.beforeAll(async ({ browser }) => {
    [ownerCtx, counselorCtx, studentCtx, parent1Ctx, parent2Ctx] =
      await Promise.all([
        browser.newContext(),
        browser.newContext(),
        browser.newContext(),
        browser.newContext(),
        browser.newContext(),
      ]);
    owner = await ownerCtx.newPage();
    counselor = await counselorCtx.newPage();
    student = await studentCtx.newPage();
    parent1 = await parent1Ctx.newPage();
    parent2 = await parent2Ctx.newPage();
  });

  test.afterAll(async () => {
    await Promise.all(
      [ownerCtx, counselorCtx, studentCtx, parent1Ctx, parent2Ctx]
        .filter(Boolean)
        .map((c) => c.close())
    );
  });

  test("1. owner creates bare family + student and assigns the counselor; the counselor sees only assigned clients and adds two parents", async () => {
    // Staff logins exist in Clerk (idempotent) and are pre-staged in the DB
    // (supabase/seed/e2e-users.sql) as claimable placeholders.
    await ensureClerkUser(env!.ownerEmail, "E2E", "Owner");
    await ensureClerkUser(env!.counselorEmail, "E2E", "Counselor");

    await signInAs(owner, env!.ownerEmail);
    await expect(owner.getByText("E2E", { exact: false }).first()).toBeVisible();

    // Bare family record.
    await owner.goto("/families/new");
    await owner.locator('input[name="household_name"]').fill(household);
    await owner.getByRole("button", { name: "Create Family" }).click();
    await owner.waitForURL(/\/families\/[0-9a-f-]{36}$/);
    familyId = owner.url().split("/").pop()!;

    // Bare student record in that family.
    await owner.goto("/students/new");
    await owner.locator('input[name="first_name"]').fill(studentFirst);
    await owner.locator('input[name="last_name"]').fill(studentLast);
    await owner
      .locator('select[name="graduation_year"]')
      .selectOption(gradYear);
    await owner
      .locator('select[name="family_id"]')
      .selectOption({ label: household });
    await owner.getByRole("button", { name: "Create Student" }).click();
    await owner.waitForURL(/\/students\/[0-9a-f-]{36}$/);
    studentId = owner.url().split("/").pop()!;

    // Assign the counselor (owner/admin-only handoff — fix plan 7.1).
    await owner.getByRole("button", { name: "Assign", exact: true }).click();
    const assignForm = owner.locator('form:has(select[name="user_id"])');
    await assignForm
      .locator('select[name="user_id"]')
      .selectOption({ label: "E2E Counselor" });
    await assignForm.locator('input[name="is_primary"]').check();
    await assignForm.getByRole("button", { name: "Assign" }).click();
    await expect(
      owner.getByText("E2E Counselor", { exact: false }).first()
    ).toBeVisible();

    // The counselor's golden path starts here: scoped roster only.
    await signInAs(counselor, env!.counselorEmail, "/students");
    await expect(counselor.getByText(studentName)).toBeVisible();
    // Firm Alpha's fixture student is assigned to a different counselor —
    // must not leak into this counselor's roster.
    await expect(counselor.getByText("Sam Studentson")).toHaveCount(0);
    // Creation is owner/admin-only (fix plan 7.1) — no Add Student for a
    // plain counselor, and /students/new 404s.
    await expect(
      counselor.getByRole("button", { name: "Add Student" })
    ).toHaveCount(0);

    // Counselor adds both parents to the household.
    await counselor.goto(`/families/${familyId}`);
    for (const [name, email, primary] of [
      [parent1Name, parent1Email, true],
      [parent2Name, parent2Email, false],
    ] as const) {
      const [first, last] = name.split(" ");
      await counselor.getByRole("button", { name: "+ Add Member" }).click();
      const form = counselor.locator('form:has(input[name="email"])');
      await form.locator('input[name="first_name"]').fill(first);
      await form.locator('input[name="last_name"]').fill(last);
      await form.locator('input[name="email"]').fill(email);
      await form
        .locator('select[name="relationship_type"]')
        .selectOption("parent");
      if (primary) {
        await form.locator('input[name="is_primary_contact"]').check();
      }
      await form.getByRole("button", { name: "Add Member" }).click();
      await expect(counselor.getByText(name)).toBeVisible();
    }
    // Exactly one Primary badge (fix plan 7.8).
    await expect(counselor.getByText("Primary", { exact: true })).toHaveCount(
      1
    );
  });

  test("2. student and both parents accept portal invitations and land in their portals", async () => {
    // Counselor sends the student invite from the student page.
    await counselor.goto(`/students/${studentId}`);
    await counselor.getByRole("button", { name: "Invite to portal" }).click();
    await counselor.locator("#invite-email").fill(studentEmail);
    await counselor.getByRole("button", { name: "Send invite" }).click();
    await expect(counselor.getByText(/Invite sent/i).first()).toBeVisible();

    // …and both parent invites from the family page.
    await counselor.goto(`/families/${familyId}`);
    for (let i = 0; i < 2; i++) {
      await counselor
        .getByRole("button", { name: "Invite to portal" })
        .first()
        .click();
      // Email prefilled from the member record.
      await counselor.getByRole("button", { name: "Send invite" }).click();
      await expect(counselor.getByText(/Invite sent/i).nth(i)).toBeVisible();
    }

    // All three sign in with their invited addresses (Clerk test users;
    // the app's claim path links them to the pre-staged placeholders and
    // marks the invitations accepted). No manual DB steps.
    await ensureClerkUser(studentEmail, studentFirst, studentLast);
    const [p1First, p1Last] = parent1Name.split(" ");
    const [p2First, p2Last] = parent2Name.split(" ");
    await ensureClerkUser(parent1Email, p1First, p1Last);
    await ensureClerkUser(parent2Email, p2First, p2Last);

    await signInAs(student, studentEmail, "/student-dashboard");
    await expect(student).toHaveURL(/student-dashboard/);

    await signInAs(parent1, parent1Email, "/family-dashboard");
    await expect(parent1).toHaveURL(/family-dashboard/);

    await signInAs(parent2, parent2Email, "/family-dashboard");
    await expect(parent2).toHaveURL(/family-dashboard/);

    // The counselor sees the acceptances (both claim paths mark the
    // invitations accepted — fix plan 2.4).
    await counselor.goto(`/families/${familyId}`);
    await expect(counselor.getByText("Portal active")).toHaveCount(2);
    await counselor.goto(`/students/${studentId}`);
    await expect(counselor.getByText("Joined")).toBeVisible();
  });

  test("3. counselor records intake data and it drives recommendations/fit", async () => {
    await counselor.goto(`/students/${studentId}`);
    await counselor.getByRole("button", { name: "Edit", exact: true }).click();
    const form = counselor.locator('form:has(input[name="sat_score"])');
    await form.locator('input[name="sat_score"]').fill("1450");
    await form
      .locator('input[name="geographic_preferences"]')
      .fill("MA, NY, CA");
    await form
      .locator('select[name="target_school_type"]')
      .selectOption("private");
    await form.locator('input[name="budget_range"]').fill("$30-60k per year");
    await form
      .locator('select[name="financial_aid_interest"]')
      .selectOption("yes");
    await form
      .locator('input[name="citizenship_status"]')
      .fill("US citizen");
    await form.getByRole("button", { name: "Save Profile" }).click();
    await expect(counselor.getByText("1450")).toBeVisible();

    // Recommendations reflect the profile (rule-based scorer over the
    // seeded catalog).
    await counselor.goto(
      `/college-planning/recommend?student_id=${studentId}`
    );
    await expect(
      counselor.getByRole("button", { name: "Add to list" }).first()
    ).toBeVisible();
  });

  test("4. counselor schedules a kickoff meeting with student and parent attendees", async () => {
    const meetingTitle = `Kickoff ${runId}`;
    await counselor.goto("/calendar");
    await counselor.getByRole("button", { name: "Schedule Meeting" }).click();
    const form = counselor.locator('form:has(input[name="start_date"])');
    await form.locator('input[name="title"]').fill(meetingTitle);
    // Tomorrow at 14:00 local — the timezone fix (7.2) means the same
    // wall-clock renders back.
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    await form.locator('input[name="start_date"]').fill(tomorrow);
    await form.locator('input[name="start_time"]').fill("14:00");
    await form.locator('input[name="end_time"]').fill("15:00");
    await form
      .locator('select[name="student_id"]')
      .selectOption({ label: studentName });
    // Check the student and parent 1 as attendees.
    for (const name of [studentName, parent1Name]) {
      await form
        .locator("label")
        .filter({ hasText: name })
        .locator('input[name="attendee_ids"]')
        .check();
    }
    await expect(form.getByText("Visible in the family portal")).toBeVisible();
    await form.getByRole("button", { name: "Schedule Meeting" }).click();
    await expect(
      counselor.getByRole("button", { name: new RegExp(meetingTitle) })
    ).toBeVisible();

    // Appears in both portals.
    await student.goto("/student-dashboard");
    await expect(student.getByText(meetingTitle)).toBeVisible();
    await parent1.goto("/family-dashboard");
    await expect(parent1.getByText(meetingTitle)).toBeVisible();

    // Editing does not silently drop data: change the location, save, and
    // the student link + both attendees survive (fix plan 7.3 / rule 6).
    await counselor
      .getByRole("button", { name: new RegExp(meetingTitle) })
      .click();
    await counselor.getByRole("button", { name: "Edit", exact: true }).click();
    const editForm = counselor.locator(
      'form:has(input[name="start_date"])'
    );
    await editForm.locator('input[name="location_text"]').fill("Main office");
    await expect(
      editForm.getByText("Visible in the family portal")
    ).toBeVisible();
    await editForm.getByRole("button", { name: "Save Changes" }).click();
    await counselor
      .getByRole("button", { name: new RegExp(meetingTitle) })
      .click();
    await expect(counselor.getByText("Main office")).toBeVisible();
    await expect(counselor.getByText(studentName).first()).toBeVisible();
    await expect(counselor.getByText(parent1Name).first()).toBeVisible();
    await counselor.getByRole("button", { name: "Close" }).click();
  });

  test("5. parent uploads a transcript; staff-only documents stay inaccessible to portals", async () => {
    const transcriptTitle = `Transcript ${runId}`;
    await parent1.goto("/family-documents");
    await parent1.getByRole("button", { name: /Upload/i }).click();
    const upForm = parent1.locator('form:has(input[name="file"])');
    await upForm.locator('input[name="file"]').setInputFiles({
      name: "transcript.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(`%PDF-1.4 e2e transcript ${runId}`),
    });
    await upForm.locator('input[name="title"]').fill(transcriptTitle);
    const studentSelect = upForm.locator('select[name="student_id"]');
    if (await studentSelect.count()) {
      await studentSelect.selectOption({ label: studentName });
    }
    await upForm.getByRole("button", { name: /Upload/i }).click();
    await expect(parent1.getByText(transcriptTitle)).toBeVisible();

    // The counselor sees it.
    await counselor.goto("/documents");
    await expect(counselor.getByText(transcriptTitle)).toBeVisible();

    // Counselor uploads a family-visible doc and a staff-only doc.
    const familyDocTitle = `Financial aid guide ${runId}`;
    const staffDocTitle = `Internal strategy ${runId}`;
    for (const [title, visibility] of [
      [familyDocTitle, "family"],
      [staffDocTitle, "staff"],
    ] as const) {
      await counselor
        .getByRole("button", { name: "Upload Document" })
        .click();
      const form = counselor.locator('form:has(input[name="file"])');
      await form.locator('input[name="file"]').setInputFiles({
        name: `${visibility}-doc.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from(`%PDF-1.4 ${title}`),
      });
      await form.locator('input[name="title"]').fill(title);
      await form
        .locator('select[name="category"]')
        .selectOption({ index: 1 });
      await form
        .locator('select[name="visibility_scope"]')
        .selectOption(visibility);
      await form
        .locator('select[name="student_id"]')
        .selectOption({ label: studentName });
      await form.getByRole("button", { name: "Upload", exact: true }).click();
      await expect(counselor.getByText(title)).toBeVisible();
    }

    // The parent can reach the family doc but never the staff-only one.
    await parent1.goto("/family-documents");
    await expect(parent1.getByText(familyDocTitle)).toBeVisible();
    await expect(parent1.getByText(staffDocTitle)).toHaveCount(0);
  });

  test("6. sophomore workflow applied; student completes a portal task; step completes", async () => {
    await counselor.goto("/workflows");
    await counselor.getByText("Sophomore Year Anchors").first().click();
    await counselor
      .getByRole("button", { name: "Apply to student" })
      .click();
    const form = counselor.locator('form:has(select[name="student_id"])');
    await form
      .locator('select[name="student_id"]')
      .selectOption({ label: studentName });
    const startDate = form.locator('input[name="start_date"]');
    if (await startDate.count()) {
      await startDate.fill(new Date().toISOString().slice(0, 10));
    }
    await form.getByRole("button", { name: /Apply/i }).click();

    // The workflow shows on the student page.
    await counselor.goto(`/students/${studentId}`);
    await expect(
      counselor.getByText("Sophomore Year Anchors").first()
    ).toBeVisible();

    // The student sees tasks in the portal and completes one.
    await student.goto("/student-tasks");
    const completeButton = student
      .getByRole("button", { name: "Mark complete" })
      .first();
    await expect(completeButton).toBeVisible();
    await completeButton.click();
    await expect(
      student.getByRole("button", { name: "Mark incomplete" }).first()
    ).toBeVisible();

    // The linked workflow step completed (progress advanced past 0).
    await counselor.goto(`/students/${studentId}`);
    await expect(counselor.getByText(/1\s*\/\s*\d+|1 of \d+/).first())
      .toBeVisible();
  });

  test("7. counselor and parent exchange messages", async () => {
    const messageBody = `Welcome aboard ${runId}! Let's plan the semester.`;
    await counselor.goto("/messages");
    await counselor
      .getByRole("button", { name: "New Conversation" })
      .click();
    const form = counselor.locator('form:has(textarea[name="message"])');
    await form
      .locator('select[name="student_id"]')
      .selectOption({ label: studentName });
    // Parent 1 as the client participant (portal accounts only).
    await form
      .locator("label")
      .filter({ hasText: parent1Name })
      .locator('input[name="participant_ids"]')
      .check();
    await form.locator('textarea[name="message"]').fill(messageBody);
    await form
      .getByRole("button", { name: "Start Conversation" })
      .click();
    await expect(counselor.getByText(messageBody).first()).toBeVisible();

    // The parent sees it in the family portal and replies.
    const replyBody = `Thanks — excited to start! (${runId})`;
    await parent1.goto("/family-messages");
    await expect(parent1.getByText(messageBody).first()).toBeVisible();
    await parent1.getByText(messageBody).first().click();
    const replyBox = parent1.locator("textarea").last();
    await replyBox.fill(replyBody);
    await parent1.getByRole("button", { name: "Send", exact: true }).click();
    await expect(parent1.getByText(replyBody)).toBeVisible();

    // The counselor sees the reply. (The notification email to offline
    // participants is dispatched via Inngest + Resend — asserted by the
    // unit/integration layers, not observable from the browser.)
    await counselor.goto("/messages");
    await expect(counselor.getByText(replyBody).first()).toBeVisible();
  });

  test("8. counselor builds a categorized college list with rounds; fit analysis renders", async () => {
    await counselor.goto(`/students/${studentId}/colleges`);
    for (const entry of collegeListEntries) {
      await counselor
        .getByRole("button", { name: "Add College", exact: true })
        .first()
        .click();
      const form = counselor.locator(
        'form:has(select[name="college_id"])'
      );
      await form
        .locator('input[placeholder="Search colleges..."]')
        .fill(entry.search);
      await form
        .locator('select[name="college_id"] option')
        .first()
        .waitFor();
      const firstOption = form.locator('select[name="college_id"] option').first();
      await form
        .locator('select[name="college_id"]')
        .selectOption({ label: await firstOption.textContent() ?? "" });
      await form.locator('select[name="category"]').selectOption(entry.category);
      await form.locator('select[name="round_type"]').selectOption(entry.round);
      await form.getByRole("button", { name: "Add College" }).click();
      await expect(form).toBeHidden();
    }
    // Three rows with their categories.
    await expect(counselor.getByText(/Reach/i).first()).toBeVisible();
    await expect(counselor.getByText(/Safety/i).first()).toBeVisible();
    await expect(counselor.getByText(/Target/i).first()).toBeVisible();

    // A general student note (audience chosen explicitly in the form).
    await counselor.goto(`/students/${studentId}`);
    await counselor.getByRole("button", { name: "Add Note" }).click();
    const noteForm = counselor.locator('form:has(textarea[name="body"])');
    await noteForm
      .locator('textarea[name="body"]')
      .fill(`Strong STEM profile — target research programs. (${runId})`);
    await noteForm.getByRole("button", { name: "Save Note" }).click();
    await expect(
      counselor.getByText(/Strong STEM profile/).first()
    ).toBeVisible();
  });

  test("9. application created from list with editable deadline and checklist", async () => {
    await counselor.goto(`/students/${studentId}/colleges`);
    // Row actions → Create application on the first row.
    await counselor
      .getByRole("button", { name: "Row actions" })
      .first()
      .click();
    await counselor
      .getByRole("button", { name: "Create application" })
      .click();
    // The row now links to an application; open the board scoped by the
    // new student filter (fix plan 8.6) and follow the card link.
    await counselor.goto("/applications");
    await counselor
      .locator("select")
      .filter({ has: counselor.locator(`option:text-is("${studentName}")`) })
      .first()
      .selectOption({ label: studentName });
    await counselor
      .getByRole("link", { name: /Harvard/i })
      .first()
      .click();
    await counselor.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
    applicationId = counselor.url().split("/").pop()!;

    // Requirements checklist seeded and checkable.
    await expect(counselor.getByText(/0\/\d+ complete/)).toBeVisible();
    await counselor
      .locator("li")
      .filter({ hasText: "Application form completed" })
      .locator('input[type="checkbox"]')
      .check();
    await expect(counselor.getByText(/1\/\d+ complete/)).toBeVisible();

    // Deadline is editable after creation.
    const deadline = `${Number(gradYear) - 1}-11-01`;
    await counselor.getByRole("button", { name: "Edit Details" }).click();
    const editForm = counselor.locator(
      'form:has(input[name="deadline_at"])'
    );
    await editForm.locator('input[name="deadline_at"]').fill(deadline);
    await editForm.getByRole("button", { name: /Save/i }).click();
    await expect(counselor.getByText(/Nov 1/i).first()).toBeVisible();
  });

  test("10. essay shared with student, edited in portal, reviewed, finalized", async () => {
    const essayTitle = `Personal statement ${runId}`;
    await counselor.goto("/essays");
    await counselor.getByRole("button", { name: "New Essay" }).click();
    const form = counselor.locator('form:has(select[name="essay_type"])');
    await form
      .locator('select[name="student_id"]')
      .selectOption({ label: studentName });
    await form
      .locator('select[name="visibility_scope"]')
      .selectOption("student");
    await form.locator('input[name="title"]').fill(essayTitle);
    await form
      .locator('select[name="essay_type"]')
      .selectOption("personal_statement");
    await form
      .locator('textarea[name="prompt_text"]')
      .fill("Describe a challenge you overcame.");
    await form.locator('input[name="word_count_target"]').fill("650");
    await form.getByRole("button", { name: "Create Draft" }).click();
    await counselor.waitForURL(/\/essays\/[0-9a-f-]{36}$/);
    essayId = counselor.url().split("/").pop()!;

    // The student edits the draft in the portal and submits for review.
    await student.goto(`/student-essays/${essayId}`);
    await student
      .locator("textarea")
      .last()
      .fill(
        `Sophomore year I rebuilt our robotics code base from scratch… (${runId})`
      );
    await student.getByRole("button", { name: "Save Draft" }).click();
    await student
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(student.getByText("With your counselor")).toBeVisible();

    // The counselor runs the review loop and finalizes.
    await counselor.goto(`/essays/${essayId}`);
    const statusSelect = counselor.locator(
      'select:has(option[value="revision_requested"])'
    );
    await statusSelect.selectOption("approved");
    await expect(counselor.getByText("Approved").first()).toBeVisible();
    await statusSelect.selectOption("final");
    await expect(counselor.getByText("Final").first()).toBeVisible();

    // Finalized essays lock in the portal.
    await student.goto(`/student-essays/${essayId}`);
    await expect(
      student.getByText(/finalized by your counselor/i)
    ).toBeVisible();
    await expect(
      student.getByRole("button", { name: "Save Draft" })
    ).toHaveCount(0);
  });

  test("11. decision recorded and visible in portals and reports", async () => {
    await counselor.goto(`/applications/${applicationId}`);
    await counselor.getByRole("button", { name: "Record Decision" }).click();
    const form = counselor.locator(
      'form:has(select[name="decision_result"])'
    );
    await form
      .locator('select[name="decision_result"]')
      .selectOption("accepted");
    await form.getByRole("button", { name: "Record decision" }).click();
    await expect(counselor.getByText(/accepted/i).first()).toBeVisible();

    // The counselor's college list shows the decision badge in place of the
    // stage (fix plan 8.8).
    await counselor.goto(`/students/${studentId}/colleges`);
    await expect(counselor.getByText("accepted", { exact: true }).first())
      .toBeVisible();

    // Both portals show the outcome on their applications view.
    await student.goto("/student-applications");
    await expect(student.getByText(/accepted/i).first()).toBeVisible();
    await parent1.goto("/family-applications");
    await expect(parent1.getByText(/accepted/i).first()).toBeVisible();

    // The Decision Outcomes report populates.
    await counselor.goto("/reports");
    await expect(
      counselor.getByText(/Decision Outcomes/i).first()
    ).toBeVisible();
    await expect(counselor.getByText(/Accepted/i).first()).toBeVisible();
  });

  test("12. isolation: cross-firm and cross-role access is denied at the route level", async () => {
    // Portal roles never reach staff surfaces — the shell redirects them
    // back to their portals.
    await parent1.goto("/students");
    await expect(parent1).not.toHaveURL(/\/students/);
    await student.goto("/essays");
    await expect(student).not.toHaveURL(/\/essays/);

    // Fixture firm Beta's family (fixed UUID from test-fixtures.sql) is
    // unreachable from a firm-Alpha counselor session.
    await counselor.goto(
      "/families/b0000000-0000-4000-8000-000000000021"
    );
    await expect(
      counselor.getByText(/not.*found|couldn.t find|404/i).first()
    ).toBeVisible();

    // Row-level isolation (cross-firm SELECT/UPDATE/INSERT, portal write
    // denials, message-sender integrity) is enforced by
    // supabase/tests/isolation.sql and tests/unit/authorize.test.ts in the
    // same CI pipeline — this browser check is the route-level double-check.
  });
});

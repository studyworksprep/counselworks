import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";

/**
 * Client proposals, end to end (migration 00051): a counselor writes and
 * emails a proposal to a prospect; the prospect reviews and approves it from
 * the public link in a browser that has never signed in; an owner turns the
 * approved proposal into a service agreement for a brand-new household, and
 * the accepted terms and payment schedule arrive in the text the family
 * signs.
 *
 * Runs under the same Clerk test-auth contract as the golden path
 * (docs/E2E.md) with the stable E2E staff logins in fixture firm Alpha, and
 * self-skips without it. Data is run-unique, so it re-runs against the same
 * database; it depends on no other spec (it authors its own agreement
 * template).
 *
 * By design it does not assert email delivery (not observable from a
 * browser — and a failed send is reported in the UI, not fatal), and it has
 * no portal persona: proposals have no portal surface. Row-level denials for
 * students and parents are in supabase/tests/isolation.sql.
 */

const env = e2eEnv();

const runId = Date.now().toString(36);
const parentFirst = "Priya";
const parentLast = `Prospect${runId}`;
const parentName = `${parentFirst} ${parentLast}`;
const studentFirst = "Arjun";
const studentName = `${studentFirst} ${parentLast}`;
const inviteDomain = env?.inviteDomain ?? "example.com";
const parentEmail = `e2e-prospect-${runId}@${inviteDomain}`;
const proposalTitle = `Comprehensive Counseling ${runId}`;
const household = `${parentLast} Household`;
const templateName = `Proposal Engagement Letter ${runId}`;
const gradYear = String(new Date().getFullYear() + 2);
// Comfortably in the future on any run date.
const firstPaymentOn = `${new Date().getFullYear() + 1}-03-15`;

/** Screenshots ride along as attachments for diagnosing a failed run. */
async function snapshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

/** Serious/critical WCAG A/AA violations on the current page. */
async function seriousAxeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  return results.violations
    .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
    .map((v) => `${v.id}: ${v.nodes.map((node) => node.html).join("; ")}`);
}

async function confirmDialog(page: Page, confirmLabel: string) {
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: confirmLabel, exact: true })
    .click();
}

test.describe.serial("client proposals: prospect → approval → service agreement", () => {
  test.skip(!env, "Clerk test-auth env not configured — see docs/E2E.md");
  test.use({ actionTimeout: 20_000 });

  let ownerCtx: BrowserContext;
  let counselorCtx: BrowserContext;
  let publicCtx: BrowserContext;
  let owner: Page;
  let counselor: Page;
  // A never-signed-in browser: the prospect has no account of any kind.
  let visitor: Page;

  let proposalPath = "";
  let proposalUrl = "";

  test.beforeAll(async ({ browser }) => {
    [ownerCtx, counselorCtx, publicCtx] = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    owner = await ownerCtx.newPage();
    counselor = await counselorCtx.newPage();
    visitor = await publicCtx.newPage();
  });

  test.afterAll(async () => {
    await Promise.all(
      [ownerCtx, counselorCtx, publicCtx].filter(Boolean).map((c) => c.close())
    );
  });

  test("counselor writes a proposal with a discount, a deposit + monthly plan, and test prep; previews and emails it", async ({}, testInfo) => {
    await ensureClerkUser(env!.counselorEmail, "E2E", "Counselor");
    await signInAs(counselor, env!.counselorEmail, "/proposals");
    await expect(
      counselor.getByRole("heading", { name: "Proposals", exact: true })
    ).toBeVisible();
    // The staff nav carries the entry for client-management staff.
    await expect(
      counselor
        .locator('aside[aria-label="Main navigation"]')
        .getByRole("link", { name: "Proposals" })
    ).toBeVisible();

    await counselor.getByRole("button", { name: "New proposal" }).first().click();
    await expect(counselor).toHaveURL(/\/proposals\/new$/);
    const form = counselor.locator("form:has(input[name='parent_email'])");

    await form.locator('input[name="parent_first_name"]').fill(parentFirst);
    await form.locator('input[name="parent_last_name"]').fill(parentLast);
    await form.locator('input[name="parent_email"]').fill(parentEmail);
    await form.locator('input[name="student_first_name"]').fill(studentFirst);
    await form.locator('input[name="student_last_name"]').fill(parentLast);
    await form.locator('select[name="graduation_year"]').selectOption(gradYear);
    await form.locator('input[name="title"]').fill(proposalTitle);
    await form
      .locator('textarea[name="intro_message"]')
      .fill("It was a pleasure meeting you both. Here is what we discussed.");

    // Pricing: typing the percent fills the discounted cost.
    await form.locator('input[name="total_cost"]').fill("12,000");
    await form.locator('input[name="discount_percent"]').fill("10");
    await expect(form.locator('input[name="discounted_cost"]')).toHaveValue("10,800");
    await expect(form.getByTestId("summary-total")).toHaveText("$10,800.00");

    // Half/half is the default; its date defaults to January 1 of senior year.
    await expect(form.locator('input[name="balance_due_on"]')).toHaveValue(
      `${gradYear}-01-01`
    );
    await expect(form.getByTestId("schedule-preview")).toContainText(
      "First half (due at signing)"
    );

    // Switch to deposit + monthly. The preview explains what is missing
    // until the plan is complete, then shows the exact schedule.
    await form.getByLabel("Deposit + monthly payments").check();
    await expect(form.getByTestId("schedule-problem")).toHaveText(
      "Enter the deposit amount"
    );
    await form.locator('input[name="deposit_amount"]').fill("2,000");
    await form.locator('input[name="installment_count"]').fill("4");
    await form.locator('input[name="first_payment_on"]').fill(firstPaymentOn);
    const preview = form.getByTestId("schedule-preview");
    await expect(preview).toContainText("Deposit (due at signing)");
    await expect(preview).toContainText("Monthly payment 4 of 4");
    await expect(preview.locator("li")).toHaveCount(5);
    await expect(preview).toContainText("$2,200.00");

    // Test prep: the starter terms pick up the lesson clause with the pack.
    const terms = form.locator('textarea[name="terms_and_conditions"]');
    await expect(terms).not.toHaveValue(/Test preparation lessons/);
    await form.getByLabel("Include test preparation lessons").check();
    await form.locator('input[name="test_prep_lessons"]').fill("10");
    await form.locator('input[name="additional_session_rate"]').fill("150");
    await expect(terms).toHaveValue(/Test preparation lessons/);
    await expect(terms).toHaveValue(/No guarantee of admission/);

    await snapshot(counselor, testInfo, "builder-form");
    await form.getByRole("button", { name: "Save draft and preview" }).click();
    await counselor.waitForURL(/\/proposals\/[0-9a-f-]{36}$/);
    proposalPath = new URL(counselor.url()).pathname;

    // The draft preview is the client's view: nothing has been sent, and
    // there is no public link yet.
    await expect(counselor.getByText("Draft", { exact: true })).toBeVisible();
    await expect(counselor.getByLabel("Client link")).toHaveCount(0);
    const doc = counselor.getByRole("region", { name: "Proposal preview" });
    await expect(doc.getByText(parentName)).toBeVisible();
    await expect(doc.getByText(`${studentName} · Class of ${gradYear}`)).toBeVisible();
    await expect(doc.getByTestId("proposal-total")).toHaveText("$10,800.00");
    await expect(doc.getByText("Discount (10%)")).toBeVisible();
    await expect(doc.getByText("Monthly payment 4 of 4")).toBeVisible();
    await expect(
      doc.getByText("10 test preparation lessons included at no additional charge")
    ).toBeVisible();
    await expect(doc.getByText("$150.00 per session")).toBeVisible();
    await expect(doc.getByText("No guarantee of admission.")).toBeVisible();
    await snapshot(counselor, testInfo, "draft-preview");

    // Email it. Delivery itself is not observable here (and a failed send
    // is reported, not fatal) — the durable outcome is the live link.
    await counselor.getByRole("button", { name: "Email to client" }).click();
    await confirmDialog(counselor, "Send proposal");
    await expect(counselor.getByText("Awaiting approval", { exact: true })).toBeVisible();
    proposalUrl = await counselor.getByLabel("Client link").inputValue();
    expect(proposalUrl).toMatch(/\/proposal\/[a-f0-9]{48}$/);

    // The list shows it with its derived status and price.
    await counselor.goto("/proposals");
    const row = counselor.locator("tr", { hasText: parentName });
    await expect(row).toContainText("Awaiting approval");
    await expect(row).toContainText("$10,800.00");
    await expect(row).toContainText(proposalTitle);

    // Search runs in the database (parent, student, or title).
    const search = counselor.getByLabel("Search proposals");
    await search.fill(parentLast);
    await expect(counselor).toHaveURL(/search=/);
    await expect(row).toBeVisible();
    await search.fill(`no-such-family-${runId}`);
    await expect(counselor.getByText("No proposals match")).toBeVisible();
  });

  test("the prospect reads the proposal from the link with no account; an edit made meanwhile cannot be approved unseen", async ({}, testInfo) => {
    // Unknown tokens are a plain 404, never a redirect to sign-in.
    await visitor.goto(`/proposal/${"0".repeat(48)}`);
    await expect(visitor.getByText(/not.*found|404/i).first()).toBeVisible();
    await expect(visitor).not.toHaveURL(/sign-in/);
    // ...while the staff pages one letter away stay behind the login.
    await visitor.goto("/proposals");
    await expect(visitor).toHaveURL(/sign-in/);

    await visitor.goto(proposalUrl);
    await expect(visitor).not.toHaveURL(/sign-in/);
    await expect(visitor.getByRole("heading", { name: proposalTitle })).toBeVisible();
    await expect(visitor.getByText("It was a pleasure meeting you both.")).toBeVisible();
    await expect(visitor.getByTestId("proposal-total")).toHaveText("$10,800.00");
    await expect(visitor.getByText("Deposit (due at signing)")).toBeVisible();
    await expect(visitor.getByText("Monthly payment 1 of 4")).toBeVisible();
    await expect(visitor.getByText("$150.00 per session")).toBeVisible();
    await expect(visitor.getByText(/This proposal is valid through/)).toBeVisible();
    await snapshot(visitor, testInfo, "public-proposal");
    // The one page a prospect ever sees has to be usable by everyone.
    expect(await seriousAxeViolations(visitor)).toEqual([]);

    // While the prospect has the page open, the counselor edits the price.
    // The edit form defaults every field from the stored proposal.
    await counselor.goto(`${proposalPath}/edit`);
    const form = counselor.locator("form:has(input[name='parent_email'])");
    await expect(form.locator('input[name="parent_first_name"]')).toHaveValue(parentFirst);
    await expect(form.locator('input[name="parent_email"]')).toHaveValue(parentEmail);
    await expect(form.locator('select[name="graduation_year"]')).toHaveValue(gradYear);
    await expect(form.locator('input[name="title"]')).toHaveValue(proposalTitle);
    await expect(form.locator('input[name="total_cost"]')).toHaveValue("12,000");
    await expect(form.locator('input[name="discount_percent"]')).toHaveValue("10");
    await expect(form.locator('input[name="discounted_cost"]')).toHaveValue("10,800");
    await expect(form.getByLabel("Deposit + monthly payments")).toBeChecked();
    await expect(form.locator('input[name="deposit_amount"]')).toHaveValue("2,000");
    await expect(form.locator('input[name="installment_count"]')).toHaveValue("4");
    await expect(form.locator('input[name="first_payment_on"]')).toHaveValue(firstPaymentOn);
    await expect(form.getByLabel("Include test preparation lessons")).toBeChecked();
    await expect(form.locator('input[name="test_prep_lessons"]')).toHaveValue("10");
    await expect(form.locator('input[name="additional_session_rate"]')).toHaveValue("150");
    await expect(form.locator('textarea[name="terms_and_conditions"]')).toHaveValue(
      /Test preparation lessons/
    );
    // Typing a round discounted cost derives the percent instead.
    await form.locator('input[name="discounted_cost"]').fill("10,000");
    await expect(form.locator('input[name="discount_percent"]')).toHaveValue("16.67");
    await form.getByRole("button", { name: "Save changes" }).click();
    await counselor.waitForURL(new RegExp(`${proposalPath}$`));
    await expect(
      counselor
        .getByRole("region", { name: "Proposal preview" })
        .getByTestId("proposal-total")
    ).toHaveText("$10,000.00");

    // The prospect, still looking at $10,800, tries to approve: refused,
    // and the page repaints with the terms as they now stand.
    const approve = visitor.locator('form:has(input[name="approved_by_name"])');
    await approve.locator('input[name="confirm"]').check();
    await approve.locator('input[name="approved_by_name"]').fill(parentName);
    await approve.getByRole("button", { name: "Approve proposal" }).click();
    await expect(
      visitor.getByText(/was updated after you opened it/i)
    ).toBeVisible();
    await expect(visitor.getByTestId("proposal-total")).toHaveText("$10,000.00");
    await expect(visitor.getByText("Discount (16.67%)")).toBeVisible();

    // Having seen the current version, they approve it.
    await approve.getByRole("button", { name: "Approve proposal" }).click();
    await expect(visitor.getByText(/Approved on .* thank you/i)).toBeVisible();
    await expect(approve).toHaveCount(0);
    await snapshot(visitor, testInfo, "public-approved");

    // The counselor sees who approved and is told what comes next; the
    // terms are now frozen (no Edit), and the bell carries the approval.
    await counselor.goto(proposalPath);
    await expect(counselor.getByText("Approved", { exact: true }).first()).toBeVisible();
    await expect(counselor.getByText(`Online by ${parentName}`)).toBeVisible();
    await expect(counselor.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await counselor.goto(`${proposalPath}/edit`);
    await expect(counselor).toHaveURL(new RegExp(`${proposalPath}$`));

    // Client intake is an owner/admin handoff: a counselor may attach the
    // proposal to a family already assigned to them, not create a household.
    await counselor.getByRole("button", { name: "Create service agreement" }).click();
    const convert = counselor.locator('form:has(input[name="family_mode"])');
    await expect(convert.getByText("Add as a new household")).toHaveCount(0);
    await expect(
      convert.getByText(/New clients are added by an owner or admin/)
    ).toBeVisible();
    await convert.getByRole("button", { name: "Cancel" }).click();
  });

  test("owner turns the approved proposal into a service agreement for a new household; the accepted terms are in the text the family signs", async ({}, testInfo) => {
    await ensureClerkUser(env!.ownerEmail, "E2E", "Owner");
    await signInAs(owner, env!.ownerEmail, "/settings");

    // The firm's agreement template (owners/admins author these).
    await expect(owner.getByText("Service Agreements").first()).toBeVisible();
    const templateForm = owner.locator('form:has(textarea[name="body"])');
    if (!(await templateForm.isVisible())) {
      await owner.getByRole("button", { name: "New template" }).click();
    }
    await templateForm.locator('input[name="name"]').fill(templateName);
    await templateForm
      .locator('textarea[name="body"]')
      .fill(
        "This agreement between {{firm_name}} and {{family_name}}, dated {{date}}, covers college counseling for a total fee of {{total_fee}}."
      );
    await templateForm.getByRole("button", { name: "Save template" }).click();
    await expect(templateForm).toBeHidden();

    // Owners see every counselor's proposals, with who prepared each.
    await owner.goto("/proposals");
    const row = owner.locator("tr", { hasText: parentName });
    await expect(row).toContainText("Approved");
    await expect(row).toContainText("E2E Counselor");
    await row.getByRole("link", { name: parentName }).click();
    await owner.waitForURL(new RegExp(`${proposalPath}$`));

    await owner.getByRole("button", { name: "Create service agreement" }).click();
    const convert = owner.locator('form:has(input[name="family_mode"])');
    await expect(convert.getByText("$10,000.00 in 5 payments")).toBeVisible();
    await convert
      .locator('select[name="template_id"]')
      .selectOption({ label: templateName });
    // A prospect is new by default: household, parent, and student are
    // created from the proposal.
    await expect(convert.locator('input[name="family_mode"][value="new"]')).toBeChecked();
    await expect(convert.locator('input[name="household_name"]')).toHaveValue(
      `${parentLast} Family`
    );
    await convert.locator('input[name="household_name"]').fill(household);
    await snapshot(owner, testInfo, "convert-modal");
    await convert.getByRole("button", { name: "Send agreement for signature" }).click();
    await expect(convert).toBeHidden({ timeout: 60_000 });
    await expect(owner.getByText("Agreement sent", { exact: true })).toBeVisible();
    await expect(owner.getByRole("link", { name: household })).toBeVisible();
    // One agreement per approval: the hand-off is no longer offered.
    await expect(
      owner.getByRole("button", { name: "Create service agreement" })
    ).toHaveCount(0);

    // The agreement lives on the new family's Billing page with the
    // proposal's price and schedule — through the ordinary agreement flow.
    await owner.getByRole("link", { name: "Open billing" }).click();
    await owner.waitForURL(/\/families\/[0-9a-f-]{36}\/billing$/);
    await expect(owner.getByText(templateName).first()).toBeVisible();
    await expect(
      owner.getByText("$10,000.00 · $2,000.00 retainer · 4 installments")
    ).toBeVisible();
    const signingUrl = await owner.getByLabel("Signing link").first().inputValue();
    expect(signingUrl).toMatch(/\/sign\/[a-f0-9]{48}$/);

    // The household was provisioned like any other: parent as primary
    // contact, student with the proposal's class year.
    await owner.goto(owner.url().replace(/\/billing$/, ""));
    await expect(owner.getByText(parentName).first()).toBeVisible();
    await expect(owner.getByText(parentEmail)).toBeVisible();
    await expect(owner.getByText("Primary", { exact: true })).toBeVisible();
    await expect(owner.getByText(studentName)).toBeVisible();
    await expect(owner.getByText(`Class of ${gradYear}`)).toBeVisible();

    // What the family signs: the template, the accepted proposal's terms,
    // and the proposal's schedule as the agreement's payment schedule.
    await visitor.goto(signingUrl);
    await expect(
      visitor.getByRole("heading", { name: `Accepted proposal: ${proposalTitle}` })
    ).toBeVisible();
    await expect(
      visitor.getByText(new RegExp(`accepted by ${parentName} on`))
    ).toBeVisible();
    await expect(visitor.getByText("Total after discount: $10,000.00")).toBeVisible();
    await expect(
      visitor.getByText("10 test preparation lessons are included at no additional charge.")
    ).toBeVisible();
    await expect(
      visitor.getByText(/Additional sessions after the included lessons are used: \$150\.00 per session/)
    ).toBeVisible();
    await expect(visitor.getByText("No guarantee of admission.")).toBeVisible();
    await expect(
      visitor.getByRole("heading", { name: "Engagement Fee & Payment Schedule" })
    ).toBeVisible();
    await expect(visitor.getByText("Total engagement fee: $10,000.00").first()).toBeVisible();
    await expect(visitor.getByText("Monthly payment 4 of 4").first()).toBeVisible();
    await snapshot(visitor, testInfo, "signing-page-with-proposal-terms");

    // The proposal link now points the prospect at that agreement email.
    await visitor.goto(proposalUrl);
    await expect(
      visitor.getByText(/Your service agreement has been emailed to/)
    ).toBeVisible();

    // The hand-off is on the firm's activity feed, linked to the proposal.
    await owner.goto("/dashboard");
    await expect(
      owner.getByRole("link", {
        name: new RegExp(`Service agreement created from proposal: ${proposalTitle}`),
      })
    ).toBeVisible();
  });

  test("voiding that agreement returns the proposal to Approved; the next agreement reuses the household", async () => {
    await owner.goto(proposalPath);
    await owner.getByRole("link", { name: "Open billing" }).click();
    await owner.waitForURL(/\/families\/[0-9a-f-]{36}\/billing$/);
    await owner.getByRole("button", { name: "Void", exact: true }).click();
    await confirmDialog(owner, "Void");
    await expect(owner.getByText("Voided", { exact: true })).toBeVisible();

    // A voided agreement no longer counts: approved again, convertible again.
    await owner.goto(proposalPath);
    await expect(owner.getByText("Approved", { exact: true }).first()).toBeVisible();
    await owner.getByRole("button", { name: "Create service agreement" }).click();
    const convert = owner.locator('form:has(input[name="family_mode"])');
    // The household already exists and is linked — no second one is offered.
    await expect(convert.getByText("Add as a new household")).toHaveCount(0);
    await expect(
      convert.locator('input[name="family_mode"][value="existing"]')
    ).toBeChecked();
    await expect(
      convert.locator('select[name="family_id"] option:checked')
    ).toHaveText(household);
    await convert
      .locator('select[name="template_id"]')
      .selectOption({ label: templateName });
    await convert.getByRole("button", { name: "Send agreement for signature" }).click();
    await expect(convert).toBeHidden({ timeout: 60_000 });
    await expect(owner.getByText("Agreement sent", { exact: true })).toBeVisible();

    // Still exactly one household for this prospect.
    await owner.goto(`/families?search=${encodeURIComponent(household)}`);
    await expect(owner.locator("tr", { hasText: household })).toHaveCount(1);
  });

  test("proposals are private to their author and the firm's owners; withdrawing kills the link; drafts can be deleted", async () => {
    // Owner copies the proposal: a new draft of their own.
    await owner.goto(proposalPath);
    await owner.getByRole("button", { name: "Duplicate as new draft" }).click();
    await owner.waitForURL(/\/proposals\/[0-9a-f-]{36}\/edit$/);
    const copyPath = new URL(owner.url()).pathname.replace(/\/edit$/, "");
    expect(copyPath).not.toBe(proposalPath);
    const form = owner.locator("form:has(input[name='parent_email'])");
    await expect(form.locator('input[name="discounted_cost"]')).toHaveValue("10,000");
    await form.locator('input[name="title"]').fill(`${proposalTitle} v2`);

    // This version gets a custom schedule: the counselor's own lines. The
    // preview says exactly how far they are from the price until they add up.
    await form.getByLabel("Custom schedule").check();
    const lines = form.getByTestId("custom-line");
    await expect(lines).toHaveCount(2);
    await lines.nth(0).getByLabel("Amount (USD)").fill("4,000");
    await lines.nth(1).getByLabel("Payment 2").fill("Balance before applications open");
    await lines.nth(1).getByLabel("Amount (USD)").fill("5,000");
    await lines.nth(1).getByLabel("Due date").fill(firstPaymentOn);
    await expect(form.getByTestId("schedule-problem")).toContainText(
      "$1,000.00 less than the $10,000.00 cost"
    );
    await lines.nth(1).getByLabel("Amount (USD)").fill("6,000");
    await expect(form.getByTestId("schedule-preview").locator("li")).toHaveCount(2);

    await form.getByRole("button", { name: "Save changes" }).click();
    await owner.waitForURL(new RegExp(`${copyPath}$`));
    await expect(owner.getByText("Draft", { exact: true })).toBeVisible();
    const copyDoc = owner.getByRole("region", { name: "Proposal preview" });
    await expect(copyDoc.getByText("Deposit (due at signing)")).toBeVisible();
    await expect(copyDoc.getByText("Balance before applications open")).toBeVisible();
    await expect(copyDoc.getByText("$6,000.00")).toBeVisible();

    // A counselor cannot open a proposal they did not write, even by URL,
    // and it is not in their list.
    await counselor.goto(copyPath);
    await expect(counselor.getByText(/not.*found|404/i).first()).toBeVisible();
    await counselor.goto(`${copyPath}/edit`);
    await expect(counselor.getByText(/not.*found|404/i).first()).toBeVisible();
    await counselor.goto("/proposals");
    await expect(counselor.getByText(`${proposalTitle} v2`)).toHaveCount(0);

    // Owner sends the copy, records an approval given off-line, then
    // withdraws it: the client's link dies with it.
    await owner.getByRole("button", { name: "Email to client" }).click();
    await confirmDialog(owner, "Send proposal");
    await expect(owner.getByText("Awaiting approval", { exact: true })).toBeVisible();
    const copyUrl = await owner.getByLabel("Client link").inputValue();
    await visitor.goto(copyUrl);
    await expect(
      visitor.getByRole("heading", { name: `${proposalTitle} v2` })
    ).toBeVisible();

    await owner.getByRole("button", { name: "Mark as approved" }).click();
    await confirmDialog(owner, "Mark approved");
    await expect(owner.getByText("Recorded by E2E Owner")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText(/Approved on .* thank you/i)).toBeVisible();
    await expect(
      visitor.locator('form:has(input[name="approved_by_name"])')
    ).toHaveCount(0);

    await owner.getByRole("button", { name: "Withdraw proposal" }).click();
    await confirmDialog(owner, "Withdraw");
    await expect(owner.getByText("Withdrawn", { exact: true }).first()).toBeVisible();
    await expect(owner.getByLabel("Client link")).toHaveCount(0);
    await visitor.goto(copyUrl);
    await expect(visitor.getByText(/not.*found|404/i).first()).toBeVisible();

    // A draft that was never sent can simply be deleted.
    await owner.getByRole("button", { name: "Duplicate as new draft" }).click();
    await owner.waitForURL(/\/proposals\/[0-9a-f-]{36}\/edit$/);
    const draftPath = new URL(owner.url()).pathname.replace(/\/edit$/, "");
    // Switched to half/half, it picks up the January 1 default and saves.
    const draftForm = owner.locator("form:has(input[name='parent_email'])");
    await draftForm.getByLabel("Half up front, half at the final application").check();
    await expect(draftForm.locator('input[name="balance_due_on"]')).toHaveValue(
      `${gradYear}-01-01`
    );
    await draftForm.getByRole("button", { name: "Save changes" }).click();
    await owner.waitForURL(new RegExp(`${draftPath}$`));
    await expect(
      owner.getByText(
        `Second half (when the final application is submitted or January 1, ${gradYear}, whichever comes first)`
      )
    ).toBeVisible();
    await owner.getByRole("button", { name: "Delete draft" }).click();
    await confirmDialog(owner, "Delete draft");
    await owner.waitForURL(/\/proposals$/);
    await owner.goto(draftPath);
    await expect(owner.getByText(/not.*found|404/i).first()).toBeVisible();
  });

  test("client rejects with feedback; the counselor reviews it and starts a revised draft", async ({}, testInfo) => {
    await counselor.goto(proposalPath);
    await counselor.getByRole("button", { name: "Duplicate as new draft" }).click();
    await counselor.waitForURL(/\/proposals\/[0-9a-f-]{36}\/edit$/);
    const declinedPath = new URL(counselor.url()).pathname.replace(/\/edit$/, "");
    const form = counselor.locator("form:has(input[name='parent_email'])");
    await form.locator('input[name="title"]').fill(`${proposalTitle} feedback`);
    await form.getByRole("button", { name: "Save changes" }).click();
    await counselor.waitForURL(new RegExp(`${declinedPath}$`));
    await counselor.getByRole("button", { name: "Email to client" }).click();
    await confirmDialog(counselor, "Send proposal");
    await expect(counselor.getByText("Awaiting approval", { exact: true })).toBeVisible();
    const declinedUrl = await counselor.getByLabel("Client link").inputValue();
    await visitor.goto(declinedUrl);
    await visitor.setViewportSize({ width: 390, height: 844 });
    await expect(visitor.getByRole("button", { name: "Approve proposal", exact: true })).toBeVisible();
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await snapshot(visitor, testInfo, "proposal-mobile");
    await visitor.getByRole("button", { name: "Reject / request changes", exact: true }).click();
    const feedback = visitor.getByLabel("Feedback / requested changes");
    await expect(feedback).toBeFocused();
    await visitor.getByRole("button", { name: "Reject proposal", exact: true }).click();
    await expect(feedback).toBeVisible(); // required text blocks an empty submission
    const comment = "Could we spread the payments across six months?\nPlease also clarify the essay support.";
    await feedback.fill(comment);
    expect(await seriousAxeViolations(visitor)).toEqual([]);
    await visitor.getByRole("button", { name: "Reject proposal", exact: true }).click();
    await expect(visitor.getByRole("heading", { name: "Proposal rejected", exact: true })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole("region", { name: "Proposal rejection" })).toContainText(comment);
    await expect(visitor.getByRole("button", { name: "Approve proposal", exact: true })).toHaveCount(0);
    await snapshot(visitor, testInfo, "proposal-rejected");
    await visitor.setViewportSize({ width: 1280, height: 900 });

    await counselor.goto(declinedPath);
    await expect(counselor.getByText("Rejected", { exact: true }).first()).toBeVisible();
    await expect(counselor.getByRole("region", { name: "Client feedback" })).toContainText(comment);
    await expect(counselor.getByRole("button", { name: "Mark as approved", exact: true })).toHaveCount(0);
    await expect(counselor.getByRole("button", { name: "Create service agreement", exact: true })).toHaveCount(0);
    await counselor.goto("/proposals?status=rejected");
    await expect(counselor.locator("tr", { hasText: `${proposalTitle} feedback` })).toContainText("Rejected");
    await counselor.goto(declinedPath);
    await counselor.getByRole("button", { name: "Duplicate as new draft" }).click();
    await counselor.waitForURL(/\/proposals\/[0-9a-f-]{36}\/edit$/);
    const revisedPath = new URL(counselor.url()).pathname.replace(/\/edit$/, "");
    expect(revisedPath).not.toBe(declinedPath);
    await expect(counselor.locator('input[name="parent_email"]')).toHaveValue(parentEmail);
    await visitor.reload();
    await expect(visitor.getByRole("region", { name: "Proposal rejection" })).toContainText(comment);
  });

});

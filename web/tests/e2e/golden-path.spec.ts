import {
  test,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";
import {
  assignFirmStripeAccount,
  createChargesEnabledAccount,
} from "./helpers/stripe";

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
 *   - Step 3 asserts the agreement + fee terms are created and executed
 *     in-app; the signature-request email is delivery, out of scope like
 *     the invites in step 2.
 *   - Step 4 manufactures the firm's onboarded Stripe account via the
 *     test-token recipe (hosted onboarding can't be driven in CI; the UI
 *     connect journey lives in connect-onboarding.spec.ts) and relies on
 *     `stripe listen --forward-connect-to` for webhook delivery. It skips
 *     when STRIPE_SECRET_KEY is absent.
 *   - Step 9 asserts the in-app exchange, not the notification email
 *     (Resend delivery is not observable from the browser).
 *   - Step 12 exercises the review-status loop; the AI coach review call is
 *     excluded to keep CI deterministic and key-free.
 *   - Step 14 asserts browser-level route denials; row-level isolation is
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

/**
 * Drive Stripe-hosted test-mode Checkout with the standard success card.
 * The session is card-only, so this is the single-form layout; wait for
 * the field to be interactable (Checkout boots progressively) before
 * filling. Shared by the retainer payment (step 4) and the partial
 * payment (step 4b).
 */
async function payThroughStripeCheckout(page: Page) {
  await expect(page.locator('input[name="cardNumber"]')).toBeEditable({
    timeout: 60_000,
  });
  await page.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
  await page.locator('input[name="cardExpiry"]').fill("12 / 34");
  await page.locator('input[name="cardCvc"]').fill("123");
  await page.locator('input[name="billingName"]').fill(parent1Name);
  // The postal field renders only after the card number identifies a US
  // card — an instant isVisible() check raced it, leaving ZIP empty and
  // client-side validation silently blocking the confirm (found via the
  // trace: no /confirm POST, "ZIP required" in the DOM).
  const zip = page.locator('input[name="billingPostalCode"]');
  await zip.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  if (await zip.isVisible()) await zip.fill("94102");
  // Link's "Save my information" box comes pre-checked and demands a
  // phone number, silently failing validation on Pay (seen in the trace
  // screencast). Opt out of Link instead of feeding it a phone.
  const linkSave = page.getByRole("checkbox", { name: /save my information/i });
  if (await linkSave.isChecked().catch(() => false)) {
    await linkSave.uncheck();
  }
  await page
    .getByTestId("hosted-payment-submit-button")
    .or(page.locator('button[type="submit"]'))
    .first()
    .click();
}

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
  // A never-signed-in browser: the household member who signs and pays
  // from the secure link with no portal account (fix plan 12.7).
  let publicCtx: BrowserContext;
  let visitor: Page;

  // Cross-step state.
  let familyId = "";
  let signingUrl = "";
  let studentId = "";
  let applicationId = "";
  let essayId = "";
  // Sandbox identity verification takes ~a minute; start it in beforeAll
  // so it runs concurrently with steps 1–3 and step 4 only awaits it.
  let stripeAccountPromise: Promise<string> | null = null;
  const firmAlphaId = "a0000000-0000-4000-8000-000000000001";

  test.beforeAll(async ({ browser }) => {
    [ownerCtx, counselorCtx, studentCtx, parent1Ctx, parent2Ctx, publicCtx] =
      await Promise.all([
        browser.newContext(),
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
    visitor = await publicCtx.newPage();

    if (env && process.env.STRIPE_SECRET_KEY) {
      stripeAccountPromise = createChargesEnabledAccount(firmAlphaId);
      // A failure surfaces in step 4 where it's awaited; don't let the
      // background promise nuke the suite as unhandled.
      stripeAccountPromise.catch(() => {});
    }
  });

  test.afterAll(async () => {
    await Promise.all(
      [ownerCtx, counselorCtx, studentCtx, parent1Ctx, parent2Ctx, publicCtx]
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
    // Confirm the authenticated staff shell rendered rather than a bounce back
    // to /sign-in. Deliberately not asserting on the user's name: the header
    // uses Clerk's <UserButton />, which renders an avatar and no name text,
    // so the original getByText("E2E") could never have matched.
    await expect(owner).toHaveURL(/\/dashboard/);
    await expect(
      owner.locator('aside[aria-label="Main navigation"]')
    ).toBeVisible();

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
    // The modal closes only on success — an error renders an Alert and keeps it
    // open — so this is the deterministic signal that the action returned, and
    // it fails loudly with the modal still on screen if it didn't.
    await expect(assignForm).toBeHidden();
    // No reload: the row must appear from the action's own revalidated
    // payload (the form now submits via useActionState / form action, so the
    // framework applies it). A failure here is the stale-page regression.
    // Assert on the rendered assignment row, not a bare text match. The staff
    // dropdown on this same page contains <option>E2E Counselor</option>, which
    // is never "visible" to Playwright, so getByText(...).first() resolved to a
    // hidden option whenever the select happened to render first.
    await expect(
      owner.locator("li").filter({ hasText: "E2E Counselor" }).first()
    ).toBeVisible();

    // The counselor's golden path starts here: scoped roster only. The
    // student rail (fix plan 13.0) lists the student beside the roster
    // table, so the name renders twice — both role-scoped, so the fixture
    // student below must appear in neither.
    await signInAs(counselor, env!.counselorEmail, "/students");
    await expect(
      counselor.getByRole("table").getByText(studentName, { exact: true })
    ).toBeVisible();
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

  test("1b. owner bulk-imports a household from CSV: dry-run preview, import, idempotent re-import", async () => {
    // Fix plan 13.4. A second household for this run, assigned to the owner
    // so the counselor's scoped roster (asserted above) is unaffected.
    const csv = [
      "Household,First Name,Last Name,Class of,School,Parent First Name,Parent Last Name,Parent Email,Counselor Email",
      `Import Household ${runId},Imogen,Imported ${runId},${gradYear},Import High,Ivy,Imported,ivy-${runId}@example.com,${env!.ownerEmail}`,
    ].join("\n");
    const csvFile = {
      name: "clients.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    };

    // Preview is disabled until React's onChange records the file, and a
    // change event fired before hydration is lost for good (seen as an
    // intermittent "element is not enabled" timeout in CI) — so re-select
    // the file until the button enables.
    const chooseCsv = async () => {
      await expect(async () => {
        await owner.getByLabel("CSV file").setInputFiles(csvFile);
        await expect(
          owner.getByRole("button", { name: "Preview" })
        ).toBeEnabled({ timeout: 2000 });
      }).toPass({ timeout: 30_000 });
    };

    await owner.goto("/students/import");
    await chooseCsv();
    await owner.getByRole("button", { name: "Preview" }).click();
    await expect(owner.getByTestId("import-summary")).toContainText(
      "1 household, 1 student, 1 parent, and 1 assignment to create"
    );
    await owner.getByRole("button", { name: "Import", exact: true }).click();
    await expect(owner.getByTestId("import-result")).toContainText(
      "Imported: 1 household, 1 student, 1 parent, 1 assignment"
    );

    // Same file again: nothing to create, and Import stays disabled.
    await chooseCsv();
    await owner.getByRole("button", { name: "Preview" }).click();
    await expect(owner.getByTestId("import-summary")).toContainText(
      "0 households, 0 students, 0 parents, and 0 assignments to create"
    );
    await expect(owner.getByRole("button", { name: "Import", exact: true })).toBeDisabled();

    // The imported student is on the roster with the owner assigned, and
    // the parent is a household member awaiting a portal invite.
    await owner.goto("/students");
    await expect(
      owner.getByRole("table").getByText(`Imogen Imported ${runId}`, { exact: true })
    ).toBeVisible();
    // Click the roster row: the household rail also lists the name, inside
    // a collapsed letter group that isn't visible.
    await owner.goto("/families");
    await owner
      .locator("tr")
      .filter({ hasText: `Import Household ${runId}` })
      .first()
      .click();
    await owner.waitForURL(/\/families\/[0-9a-f-]{36}$/);
    await expect(owner.getByText("Ivy Imported")).toBeVisible();
    await expect(owner.getByText("Primary", { exact: true })).toHaveCount(1);
  });

  test("2. student and both parents accept portal invitations and land in their portals", async () => {
    // Counselor sends the student invite from the student page.
    await counselor.goto(`/students/${studentId}`);
    await counselor.getByRole("button", { name: "Invite to portal" }).click();
    await counselor.locator("#invite-email").fill(studentEmail);
    await counselor.getByRole("button", { name: "Send invite" }).click();
    // What this step tests is that the invitation is CREATED and claimable —
    // the personas below sign in through the Clerk Backend API and never open
    // the emailed link, so delivery is out of scope here exactly as the step 7
    // notification email already is (docs/E2E.md). Resend legitimately refuses
    // the default invite domain: example.com is RFC 2606 reserved and cannot
    // receive mail, so the app correctly reports "Invitation created, but the
    // email failed to send". Accept either outcome, but not silence — a
    // failure to create the invitation still fails here.
    await expect(
      counselor.getByText(/Invite sent|Invitation created/i).first()
    ).toBeVisible();

    // The modal deliberately stays open when the send fails, so the counselor
    // can retry — which means the test has to dismiss it. Leaving it open put
    // its overlay over the next control and the following click hung until the
    // 120s test timeout.
    await counselor.getByRole("button", { name: "Cancel" }).click();

    // …and both parent invites from the family page. Invite each member by
    // name rather than .first(): once a member is invited their control
    // changes, so "first" is not stable across iterations.
    await counselor.goto(`/families/${familyId}`);
    for (const memberName of [parent1Name, parent2Name]) {
      const row = counselor.locator("li, tr").filter({ hasText: memberName });
      await row.getByRole("button", { name: /Invite to portal/i }).click();
      // Email prefilled from the member record.
      await counselor.getByRole("button", { name: "Send invite" }).click();
      // Same reasoning as the student invite above: creation is what matters,
      // delivery is out of scope.
      await expect(
        counselor.getByText(/Invite sent|Invitation created/i).first()
      ).toBeVisible();
      await counselor.getByRole("button", { name: "Cancel" }).click();
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

  test("3. owner publishes the engagement letter; counselor sends it with fee terms; family and firm execute it", async () => {
    const templateName = `Engagement Letter ${runId}`;

    // Owner authors the firm-wide template in Settings (manage_firm).
    await owner.goto("/settings");
    // Wait for the section to render before branching on the form's
    // visibility: form-open vs New-template-button is decided in the same
    // render, so probing before it commits would pick the wrong branch.
    await expect(owner.getByText("Service Agreements").first()).toBeVisible();
    const templateForm = owner.locator('form:has(textarea[name="body"])');
    // The section auto-opens the create form only when no template exists
    // yet (every CI run: fresh database); later runs against the same
    // database need the explicit button.
    if (!(await templateForm.isVisible())) {
      await owner.getByRole("button", { name: "New template" }).click();
    }
    await templateForm.locator('input[name="name"]').fill(templateName);
    await templateForm
      .locator('textarea[name="body"]')
      .fill(
        "This agreement between {{firm_name}} and {{family_name}}, dated {{date}}, covers comprehensive college counseling."
      );
    await templateForm.getByRole("button", { name: "Save template" }).click();
    // Deterministic success signal: the form closes only on success.
    await expect(templateForm).toBeHidden();

    // Counselor sends it from the family's Billing page (fix plan 13.0
    // family workspace) with fee terms. The preview and the stored schedule
    // come from the same pure builder, so what the modal shows is exactly
    // what the family will owe.
    await counselor.goto(`/families/${familyId}/billing`);
    await counselor.getByRole("button", { name: "Send agreement" }).click();
    const sendForm = counselor.locator('form:has(select[name="template_id"])');
    await sendForm
      .locator('select[name="template_id"]')
      .selectOption({ label: templateName });
    await sendForm.locator('input[name="total_fee"]').fill("12,000");
    await sendForm.locator('input[name="retainer"]').fill("3000");
    await sendForm.locator('input[name="installment_count"]').fill("2");
    await sendForm.locator('input[name="first_due_on"]').fill("2027-01-15");
    await expect(sendForm.getByText("Installment 2 of 2")).toBeVisible();
    await sendForm.getByRole("button", { name: "Send for signature" }).click();
    await expect(sendForm).toBeHidden();
    // The staff card shows the fee summary from the revalidated payload.
    await expect(
      counselor.getByText("$12,000.00 · $3,000.00 retainer · 2 installments")
    ).toBeVisible();

    // 12.7: the staff card exposes the household's secure signing link —
    // the same URL the signature-request email carries.
    signingUrl = await counselor.getByLabel("Signing link").first().inputValue();
    expect(signingUrl).toMatch(/\/sign\/[a-f0-9]{48}$/);

    // A junk token is a plain 404, never a redirect to sign-in (the route
    // is Clerk-exempt and authenticates with the token alone).
    await visitor.goto(`/sign/${"0".repeat(48)}`);
    await expect(visitor.getByText(/not.*found|404/i).first()).toBeVisible();
    await expect(visitor).not.toHaveURL(/sign-in/);

    // The family signs from the link in a browser that has NEVER signed
    // in: no portal account is needed to review and sign (12.7). The fee
    // terms appear as a structured card (heading) and inside the signed
    // text itself; the money strings appear in both, so .first().
    await visitor.goto(signingUrl);
    await expect(
      visitor.getByRole("heading", { name: "Engagement Fee & Payment Schedule" })
    ).toBeVisible();
    await expect(
      visitor.getByText("Total engagement fee: $12,000.00").first()
    ).toBeVisible();
    await expect(
      visitor.getByText("Retainer (due at signing)").first()
    ).toBeVisible();
    const signForm = visitor.locator('form:has(input[name="signed_name"])');
    await signForm.locator('input[name="consent"]').check();
    await signForm.locator('input[name="signed_name"]').fill(parent1Name);
    await signForm.getByRole("button", { name: "Sign agreement" }).click();
    await expect(
      visitor.getByText(/Waiting for the firm to countersign/i).first()
    ).toBeVisible();

    // The staff card reflects the link signature — it was recorded against
    // the parent's own user row through the shared signing core.
    await counselor.goto(`/families/${familyId}/billing`);
    await expect(counselor.getByText("Partially signed")).toBeVisible();

    // Counselor countersigns for the firm; the agreement fully executes.
    await counselor.getByRole("button", { name: "Sign for firm" }).click();
    const firmSignForm = counselor.locator(
      'form:has(input[name="signed_name"])'
    );
    await firmSignForm.locator('input[name="signed_name"]').fill("E2E Counselor");
    await firmSignForm.locator('input[name="consent"]').check();
    await firmSignForm.getByRole("button", { name: "Sign agreement" }).click();
    await expect(firmSignForm).toBeHidden();
    await expect(counselor.getByText("Fully executed")).toBeVisible();

    // 12.3: execution generates one invoice per installment, inline in the
    // countersign action, so they render from the same revalidated payload.
    // Numbers are per-firm sequential and the fixtures already hold
    // INV-0001 for firm Alpha — assert shape and count, never exact values.
    await expect(
      counselor.getByRole("heading", { name: "Invoices" })
    ).toBeVisible();
    await expect(counselor.getByText(/INV-\d{4,} · /)).toHaveCount(3);

    // The secure link now shows execution and the three invoices (12.7):
    // the account-less household can see what it owes from the same URL.
    await visitor.reload();
    await expect(visitor.getByText(/fully executed/i).first()).toBeVisible();
    await expect(visitor.getByText(/INV-\d{4,} · /)).toHaveCount(3);

    // The signed-in portal sees the same execution: the invoices appear on
    // the parent's billing destination, and the signed agreement + invoice PDFs land
    // in the family's Documents (family-visible).
    await parent1.goto("/family-dashboard");
    await parent1.getByRole("navigation", { name: "Family quick actions" }).getByRole("link", { name: "Billing & agreements" }).click();
    await expect(parent1.getByText(/INV-\d{4,} · /)).toHaveCount(3);
    await parent1.goto("/family-documents");
    await expect(
      parent1.getByText(`${templateName} (signed)`)
    ).toBeVisible();
    await expect(parent1.getByText(/Invoice INV-\d{4,} — /)).toHaveCount(3);

    // 12.6: the counselor's AR aging on Reports carries the household with
    // the full open balance (retainer + two installments, nothing paid
    // yet). Role-scoped: the counselor sees it because their assigned
    // student lives in this household.
    await counselor.goto("/reports");
    const arRow = counselor.locator("tr", { hasText: household });
    await expect(arRow.first()).toBeVisible();
    await expect(arRow.first()).toContainText("$12,000.00");
  });

  test("4. the household pays the retainer invoice from the secure link through the firm's Stripe account; both parties see it paid", async () => {
    test.skip(
      !process.env.STRIPE_SECRET_KEY,
      "STRIPE_SECRET_KEY not set — payment step skipped (see docs/E2E.md)"
    );
    // Residual verification wait (pre-warmed in beforeAll) + Checkout +
    // webhook round trip all live in this step.
    test.setTimeout(240_000);

    // The charges-enabled account was manufactured in beforeAll via the
    // documented test-token recipe — the hosted onboarding UI can't be
    // driven deterministically in CI, and the UI connect journey is
    // covered by connect-onboarding.spec.ts.
    const accountId = await stripeAccountPromise!;
    await assignFirmStripeAccount(firmAlphaId, accountId);

    // Paying from the secure link, still with no portal session (12.7).
    // The portal's own Pay button drives the identical Checkout builder
    // (PayInvoiceButton → createInvoiceCheckoutSession) with a different
    // return path; this is the flow a firm that invites AFTER the deposit
    // actually relies on.
    await visitor.goto(signingUrl);
    // The retainer invoice sorts first (numbering follows installment order).
    await visitor
      .getByRole("button", { name: "Pay", exact: true })
      .first()
      .click();
    await visitor.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
    await payThroughStripeCheckout(visitor);

    // Back on the secure link with the honest "submitted" banner…
    await visitor.waitForURL(/\/sign\/[a-f0-9]{48}\?payment=submitted/, {
      timeout: 60_000,
    });
    await expect(visitor.getByText(/Payment submitted/)).toBeVisible();

    // …and the verified webhook (forwarded by `stripe listen` in CI)
    // flips the invoice to Paid. Reload-polling is safe here: no server
    // action is in flight.
    await expect(async () => {
      await visitor.reload();
      await expect(
        visitor.getByText("Paid", { exact: true }).first()
      ).toBeVisible();
    }).toPass({ timeout: 90_000, intervals: [3_000] });

    // The signed-in parent portal shows the same payment (recorded against
    // the recipient's own user row), with the balance reduced.
    await parent1.goto("/family-billing");
    await expect(parent1.getByText("Paid", { exact: true }).first()).toBeVisible();
    await expect(parent1.getByText("$9,000.00").first()).toBeVisible();

    // The counselor sees the same truth on the staff family's Billing page…
    await counselor.goto(`/families/${familyId}/billing`);
    await expect(
      counselor.getByText("Paid", { exact: true }).first()
    ).toBeVisible();
    // …and in the AR aging on Reports (12.6): the retainer moved from the
    // open balance into paid, so the household now owes the installments.
    await counselor.goto("/reports");
    const arRow = counselor.locator("tr", { hasText: household }).first();
    await expect(arRow).toBeVisible();
    await expect(arRow).toContainText("$9,000.00");
    await expect(arRow).toContainText("$3,000.00");
  });

  test("4b. owner adjusts invoices — credit, manual partial payment, void — and the household pays part of the rest online", async () => {
    test.skip(
      !process.env.STRIPE_SECRET_KEY,
      "STRIPE_SECRET_KEY not set — payment step skipped (see docs/E2E.md)"
    );
    test.setTimeout(240_000);
    // Post-plan billing adjustments. After step 4 the retainer is paid and
    // the two $4,500 installments are open ($9,000 owed).
    await owner.goto(`/families/${familyId}/billing`);
    const rows = owner.locator('[data-testid="invoice-row"]');
    await expect(rows).toHaveCount(3);
    const first = rows.filter({ hasText: "Installment 1 of 2" }).first();
    const second = rows.filter({ hasText: "Installment 2 of 2" }).first();

    // Credit $500 with a reason the household sees.
    await first.getByRole("button", { name: "Credit" }).click();
    const creditForm = owner.locator('form:has(input[name="reason"])');
    await creditForm.locator('input[name="amount"]').fill("500");
    await creditForm.locator('input[name="reason"]').fill(`Sibling discount ${runId}`);
    await creditForm.getByRole("button", { name: "Apply credit" }).click();
    await expect(creditForm).toBeHidden();
    await expect(first.getByTestId("invoice-ledger")).toContainText("$500.00 credited");
    await expect(first.getByTestId("invoice-ledger")).toContainText("$4,000.00 balance");

    // Record a $1,000 check received outside Stripe.
    await first.getByRole("button", { name: "Record payment" }).click();
    const payForm = owner.locator('form:has(select[name="method"])');
    await payForm.locator('input[name="amount"]').fill("1000");
    await payForm.locator('select[name="method"]').selectOption("check");
    await payForm.locator('input[name="reference"]').fill(`Check 1042 ${runId}`);
    await payForm.getByRole("button", { name: "Record payment" }).click();
    await expect(payForm).toBeHidden();
    await expect(first.getByTestId("invoice-ledger")).toContainText("$1,000.00 paid");
    await expect(first.getByTestId("invoice-ledger")).toContainText("$3,000.00 balance");
    // Money has been received: void is no longer offered on this invoice.
    await expect(first.getByRole("button", { name: "Void" })).toHaveCount(0);

    // Void the untouched second installment.
    await second.getByRole("button", { name: "Void" }).click();
    const voidForm = owner.locator('form:has(input[name="reason"])');
    await voidForm.locator('input[name="reason"]').fill(`Issued in error ${runId}`);
    await voidForm.getByRole("button", { name: "Void invoice" }).click();
    await expect(voidForm).toBeHidden();
    await expect(second.getByText("Void", { exact: true })).toBeVisible();
    await expect(second.getByText(`Issued in error ${runId}`)).toBeVisible();
    // Household balance: $4,500 − $500 credit − $1,000 check; the void owes nothing.
    await expect(owner.getByTestId("invoices-balance")).toContainText("$3,000.00");

    // The parent sees the same ledger: balance, partial state, void, and
    // the credit's reason in the invoice history.
    await parent1.goto("/family-billing");
    await expect(parent1.getByTestId("invoices-balance")).toContainText("$3,000.00");
    const parentFirst = parent1
      .locator('[data-testid="invoice-row"]')
      .filter({ hasText: "Installment 1 of 2" })
      .first();
    await expect(parentFirst.getByText(/Partially paid|Overdue/)).toBeVisible();
    await expect(parent1.getByText("Void", { exact: true })).toBeVisible();
    await parentFirst.getByText(/History \(2\)/).click();
    await expect(parentFirst.getByText(`Sibling discount ${runId}`)).toBeVisible();
    await expect(parentFirst.getByText(`Check 1042 ${runId}`)).toBeVisible();

    // The parent pays $500 of the remaining $3,000 online (partial Checkout).
    await parentFirst.getByRole("button", { name: "Pay part" }).click();
    const partialForm = parent1.locator('form:has(input[name="amount"])');
    await partialForm.locator('input[name="amount"]').fill("500");
    await partialForm.getByRole("button", { name: "Continue to payment" }).click();
    await parent1.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
    await payThroughStripeCheckout(parent1);
    await parent1.waitForURL(/\/family-dashboard\?payment=submitted/, {
      timeout: 60_000,
    });
    await parent1.getByRole("navigation", { name: "Family quick actions" }).getByRole("link", { name: "Billing & agreements" }).click();
    // The verified webhook records the partial payment against the ledger.
    await expect(async () => {
      await parent1.reload();
      await expect(
        parent1
          .locator('[data-testid="invoice-row"]')
          .filter({ hasText: "Installment 1 of 2" })
          .first()
          .getByTestId("invoice-ledger")
      ).toContainText("$1,500.00 paid");
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expect(parent1.getByTestId("invoices-balance")).toContainText("$2,500.00");

    // Students still see no billing surface at all.
    await student.goto("/student-dashboard");
    await expect(student.getByRole("heading", { name: "Invoices" })).toHaveCount(0);

    // AR on Reports: $2,500 open; $4,500 received (retainer + check + card).
    await counselor.goto("/reports");
    const arRow = counselor.locator("tr", { hasText: household }).first();
    await expect(arRow).toContainText("$2,500.00");
    await expect(arRow).toContainText("$4,500.00");
  });

  test("5. counselor records intake data and it drives recommendations/fit", async () => {
    // The student workspace (fix plan 13.0): the intake editor lives on the
    // Profile sub-page, reached through the workspace sub-navigation.
    await counselor.goto(`/students/${studentId}`);
    await counselor
      .getByRole("navigation", { name: "Student sections" })
      .getByRole("link", { name: "Profile" })
      .click();
    await counselor.waitForURL(new RegExp(`/students/${studentId}/profile$`));
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
    // Wait for the modal to close before asserting: it closes only on
    // success, so this is the deterministic signal that the write completed.
    // (The old reload() work-around fired while the action POST was still
    // in flight and aborted it — destroying the very write it was checking
    // for, which is where the "intermittent on identical code" failures came
    // from. Never reload into an in-flight server action.)
    await expect(form).toBeHidden();
    // No reload: the value must appear from the action's own revalidated
    // payload, same as the staff assignment in step 1.
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

  test("6. counselor schedules a kickoff meeting with student and parent attendees", async () => {
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

  test("6b. counselor publishes booking availability; a parent self-books a slot from the portal", async () => {
    // Fix plan 13.1. The counselor opens every day around the clock so the
    // run finds an open slot whatever the CI clock says; one hour of notice.
    await counselor.goto("/settings");
    const bookingForm = counselor.locator(
      'form:has(input[name="min_notice_hours"])'
    );
    await expect(bookingForm).toBeVisible();
    await bookingForm.locator('input[name="enabled"]').check();
    // Use a zone offered by Intl.supportedValuesOf even when UTC is not the saved zone.
    await bookingForm.locator('select[name="timezone"]').selectOption("America/New_York");
    await bookingForm.locator('input[name="min_notice_hours"]').fill("1");
    await bookingForm.locator('input[name="max_days_ahead"]').fill("14");
    await bookingForm
      .locator('input[name="location_text"]')
      .fill(`Video call ${runId}`);
    for (let d = 0; d < 7; d++) {
      await bookingForm.locator(`input[name="weekday_${d}_enabled"]`).check();
      await bookingForm.locator(`input[name="weekday_${d}_start"]`).fill("00:00");
      await bookingForm.locator(`input[name="weekday_${d}_end"]`).fill("23:30");
    }
    await bookingForm.getByRole("button", { name: "Save Availability" }).click();
    await expect(bookingForm.getByText("Saved")).toBeVisible();

    // The parent books the first open slot for the student.
    await parent1.goto("/family-booking");
    const firstSlot = parent1
      .locator("button[aria-pressed]")
      .first();
    await expect(firstSlot).toBeVisible();
    await expect(firstSlot).toHaveText(/^\d{1,2}:\d{2} (AM|PM) .+$/);
    await firstSlot.click();
    const confirm = parent1.locator('form:has(input[name="start"])');
    await confirm
      .locator('textarea[name="note"]')
      .fill(`Booking note ${runId}`);
    await parent1.getByRole("button", { name: "Continue", exact: true }).focus();
    await parent1.keyboard.press("Enter");
    await confirm.getByRole("button", { name: "Confirm booking" }).click();
    await expect(parent1.getByText("You're booked")).toBeVisible();

    // It is a real meeting: on the family dashboard, in the student portal,
    // and on the counselor's calendar with the family-booked marker and the
    // parent's note.
    await parent1.goto("/family-dashboard");
    await expect(parent1.getByText(/Meeting with /).first()).toBeVisible();
    await student.goto("/student-dashboard");
    await expect(student.getByText(/Meeting with /).first()).toBeVisible();
    await counselor.goto(`/students/${studentId}/meetings`);
    await expect(counselor.getByText("Booked by family").first()).toBeVisible();
    await counselor.getByText(`Video call ${runId}`).first().click();
    await expect(counselor.getByText(`Booking note ${runId}`)).toBeVisible();
    await counselor.getByRole("button", { name: "Close" }).click();
  });

  test("7. parent uploads a transcript; staff-only documents stay inaccessible to portals", async () => {
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

  test("8. sophomore workflow applied; student completes a portal task; step completes", async () => {
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
    await form.getByRole("button", { name: "Preview plan", exact: true }).click();
    await expect(counselor.getByText(/Calendar dates use/)).toBeVisible();
    await counselor.getByLabel("Plan preview",{exact:true}).locator("details summary").first().click();
    await counselor.locator("fieldset textarea").first().fill(`Plan instructions ${runId}`);
    await counselor.getByRole("button", { name: "Apply plan", exact: true }).click();
    // Wait for the saved-plan confirmation before navigating
    // BEFORE navigating — a goto aborts an in-flight action POST and destroys
    // the write, which is exactly how the step-3 reload() work-around broke.
    await expect(counselor.getByRole("link", {name:/View student's plan/})).toBeVisible();

    // The workflow shows on the student page.
    await counselor.goto(`/students/${studentId}`);
    await expect(
      counselor.getByText("Sophomore Year Anchors").first()
    ).toBeVisible();

    // The student workspace uses the same preview and safely reuses an existing plan.
    await counselor.goto(`/students/${studentId}/tasks`);
    await counselor.locator("summary").filter({hasText:"Apply plan"}).click();
    const planForm=counselor.locator('form:has(select[name="template_id"])');
    await planForm.locator('select[name="template_id"]').selectOption({label:"Sophomore Year Anchors"});
    await planForm.getByRole("button",{name:"Preview plan",exact:true}).click();
    await expect(counselor.getByText(/This plan already exists/)).toBeVisible();
    await counselor.getByRole("button",{name:"Apply plan",exact:true}).click();
    await expect(counselor.getByRole("link",{name:/View student's plan/})).toBeVisible();
    await counselor.goto(`/students/${studentId}`);
    await expect(counselor.getByRole("heading",{name:"Sophomore Year Anchors",exact:true})).toHaveCount(1);
    await expect(counselor.getByRole("button",{name:"Edit step"}).first()).toBeVisible();

    // Publication is consolidated per owner, with a canonical task link.
    await student.goto("/student-tasks");
    await student.getByRole("button", {name: /^Notifications/}).click();
    const planNotice=student.getByRole("link", {name: /New plan: Sophomore Year Anchors/});
    await expect(planNotice).toHaveCount(1);
    await expect(planNotice).toHaveAttribute("href", /^\/task\/[0-9a-f-]{36}$/);
    await student.getByRole("button", {name: /^Notifications/}).click();

    // Sharing the counselor's kickoff does not delegate completion to the student.
    await student.goto("/student-tasks");
    const kickoff = student.locator("li", { hasText: "Sophomore year kickoff" });
    await expect(kickoff).toBeVisible();
    await expect(kickoff.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
    const psat = student.locator("li", { hasText: "Take PSAT (practice)" });
    await expect(psat.getByRole("button", { name: "Mark complete" })).toBeVisible();
    const completeButtons = student.getByRole("button", {
      name: "Mark complete",
    });
    await expect(completeButtons.first()).toBeVisible();
    const openTaskCount = await completeButtons.count();
    await psat.getByRole("button", { name: "Mark complete" }).click();
    // A completed task moves to the "Completed" section (rendered only once
    // at least one task is completed) as a static check-mark row — there is
    // no "Mark incomplete" control anywhere in this UI, so assert on the
    // section appearing and the open-task count dropping.
    await expect(student.getByText("Completed", { exact: true })).toBeVisible();
    await expect(completeButtons).toHaveCount(openTaskCount - 1);

    // The linked workflow step completed (progress advanced past 0).
    await counselor.goto(`/students/${studentId}`);
    await expect(counselor.getByText(/1\s*\/\s*\d+|1 of \d+/).first())
      .toBeVisible();
  });

  test("8a. workspace task owners are independent of audience; only the selected parent completes family work", async () => {
    const instructions = "Read the full instructions. " + "Keep your task context. ".repeat(35) + "Final instruction: ask your counselor if anything is unclear.";
    const parentTask = `Parent-owned work ${runId}`;
    const studentTask = `Student-owned work ${runId}`;
    await counselor.goto(`/students/${studentId}/tasks`);
    for (const title of [studentTask, parentTask]) {
      await counselor.getByRole("button", { name: "Create Task", exact: true }).first().click();
      const form = counselor.locator('form:has(input[name="title"])');
      await form.locator('input[name="title"]').fill(title);
      await form.locator('input[name="description"]').fill(instructions);
      await expect(form.locator('select[name="student_id"]')).toHaveValue(studentId);
      if (title === parentTask) {
        await form.getByLabel("Assign To", { exact: true }).selectOption({ label: `Parent: ${parent2Name}` });
      } else {
        await expect(form.getByLabel("Assign To", { exact: true })).toHaveValue("student");
      }
      await form.locator('select[name="visibility_scope"]').selectOption("family");
      await form.getByRole("button", { name: "Create Task", exact: true }).click();
      await expect(form).toBeHidden();
      await expect(counselor.getByText(title, { exact: true })).toBeVisible();
    }
    // UX3: shared task statuses include both review states on embedded lists.
    for (const label of ["Submitted for review", "Changes requested"]) {
      await expect(counselor.getByRole("combobox", { name: "Filter by status" }).getByRole("option", { name: label, exact: true })).toHaveCount(1);
    }
    await student.goto("/student-dashboard");
    const personal = student.getByRole("heading", { name: /My work \(showing/ }).locator("..").locator("..");
    await expect(personal.getByRole("link", { name: studentTask, exact: true })).toBeVisible();
    await expect(personal.getByRole("link", { name: parentTask, exact: true })).toHaveCount(0);
    // UX2: the embedded task presentation keeps ownership and due dates on-screen.
    await counselor.setViewportSize({ width: 390, height: 844 });
    const responsiveTask = counselor.getByRole("row").filter({ has: counselor.getByRole("link", { name: studentTask, exact: true }) });
    for (const column of ["status", "assigned_to", "due_at", "actions"]) {
      const cell = responsiveTask.locator(`[data-column="${column}"]`);
      await expect(cell).toBeVisible();
      const bounds = await cell.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    }
    expect(await counselor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await counselor.setViewportSize({ width: 1280, height: 800 });
    // UX1: client memberships never become staff rows, even after invitations.
    await owner.goto("/settings");
    for (const name of [studentName, parent1Name, parent2Name]) {
      await expect(owner.getByRole("combobox", { name: `Role for ${name}`, exact: true })).toHaveCount(0);
      await expect(owner.getByRole("button", { name: `Remove ${name}`, exact: true })).toHaveCount(0);
    }
    // The same personal scope applies on fresh, explicit, invalid and return navigation.
    for (const url of ["/tasks", "/tasks?view=my", "/tasks?view=invalid"]) {
      await counselor.goto(url);
      for (const title of [studentTask, parentTask]) await expect(counselor.getByRole("link", { name: title, exact: true })).toHaveCount(0);
    }
    await counselor.getByRole("button", { name: "Team Tasks", exact: true }).click();
    for (const title of [studentTask, parentTask]) await expect(counselor.getByRole("link", { name: title, exact: true })).toBeVisible();
    await counselor.getByRole("button", { name: "Student Tasks", exact: true }).click();
    await expect(counselor.getByRole("link", { name: studentTask, exact: true })).toBeVisible();
    await counselor.getByRole("button", { name: "My Tasks", exact: true }).focus();
    await counselor.keyboard.press("Enter");
    for (const title of [studentTask, parentTask]) await expect(counselor.getByRole("link", { name: title, exact: true })).toHaveCount(0);
    await counselor.goto(`/families/${familyId}/tasks`);
    for (const title of [studentTask, parentTask]) await expect(counselor.getByRole("link", { name: title, exact: true })).toBeVisible();
    await student.goto("/student-tasks");
    await expect(student.locator("li", { hasText: studentTask }).getByRole("button", { name: "Mark complete" })).toBeVisible();
    await expect(student.locator("li", { hasText: parentTask }).getByRole("button", { name: "Mark complete" })).toHaveCount(0);
    await student.getByRole("link", { name: studentTask, exact: true }).focus();
    await student.keyboard.press("Enter");
    await student.waitForURL(/\/student-tasks\/[0-9a-f-]{36}$/);
    await expect(student.getByText(instructions, { exact: true })).toBeVisible();
    await student.setViewportSize({ width: 390, height: 844 });
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await student.getByRole("link", { name: "Ask about this task" }).click();
    await expect(student.locator("textarea").filter({ visible: true }).first()).toHaveValue(new RegExp(studentTask));
    await student.setViewportSize({ width: 1280, height: 800 });
    await parent1.goto("/family-tasks");
    await expect(parent1.getByText(parentTask, { exact: true })).toBeVisible();
    await expect(parent1.locator("li", { hasText: parentTask }).getByRole("button", { name: "Mark complete" })).toHaveCount(0);
    await parent2.goto("/family-tasks");
    await parent2.locator("li", { hasText: parentTask }).getByRole("button", { name: "Mark complete" }).click();
    await expect(parent2.locator("li", { hasText: parentTask }).getByRole("button", { name: "Mark complete" })).toHaveCount(0);
  });

  test("8b. counselor creates a weekly recurring task; the first occurrence materializes at once, reaches the student portal, and re-saving creates no duplicate", async () => {
    // Fix plan 13.3.
    const recurringTitle = `Weekly check-in ${runId}`;
    await counselor.goto("/tasks");
    await counselor.getByRole("button", { name: "New recurring task" }).click();
    const form = counselor.locator('form:has(select[name="cadence"])');
    await expect(form).toBeVisible();
    await form.locator('input[name="title"]').fill(recurringTitle);
    await form.locator('select[name="cadence"]').selectOption("weekly");
    // Start a week ago on today's weekday so an occurrence falls inside the
    // window whatever the CI clock or the firm's timezone says: the first
    // task must exist the moment the template is saved, not at the cron.
    await form
      .locator('select[name="weekday"]')
      .selectOption(String(new Date().getUTCDay()));
    await form
      .locator('input[name="starts_on"]')
      .fill(new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
    await form
      .locator('select[name="student_id"]')
      .selectOption({ label: studentName });
    await form.locator('select[name="visibility_scope"]').selectOption("student");
    await form.getByRole("button", { name: "Create Recurring Task" }).click();
    await expect(form).toBeHidden();

    // The template is listed as active and the generated task sits in the
    // task table with its Recurring badge.
    const templateRow = counselor.locator('[data-testid="recurring-task-row"]', {
      hasText: recurringTitle,
    });
    await expect(templateRow).toBeVisible();
    await expect(templateRow.getByText("Active")).toBeVisible();
    await counselor.getByRole("button", { name: "Team Tasks", exact: true }).click();
    const generated = counselor
      .locator("tr", { hasText: recurringTitle })
      .filter({ has: counselor.getByText("Recurring", { exact: true }) });
    await expect(generated.first()).toBeVisible();
    const generatedCount = await generated.count();

    // Student-visible: the student sees it in the portal...
    await student.goto("/student-tasks");
    await expect(student.getByText(recurringTitle).first()).toBeVisible();
    // ...and the parent does not (family scope was not chosen).
    await parent1.goto("/family-tasks");
    await expect(parent1.getByText("Family Tasks").first()).toBeVisible();
    await expect(parent1.getByText(recurringTitle)).toHaveCount(0);

    // Saving the template again re-runs the materializer: every field comes
    // back defaulted from the row, and the unique occurrence index means no
    // second task for the same date.
    await templateRow.getByRole("button", { name: "Edit" }).click();
    const editForm = counselor.locator('form:has(select[name="cadence"])');
    await expect(editForm.locator('input[name="title"]')).toHaveValue(recurringTitle);
    await expect(editForm.locator('select[name="visibility_scope"]')).toHaveValue("student");
    await editForm.getByRole("button", { name: "Save Recurring Task" }).click();
    await expect(editForm).toBeHidden();
    await counselor.goto("/tasks?view=team");
    await expect(generated).toHaveCount(generatedCount);
  });

  test("8c. a task opens its exact document request and preserves context through upload", async () => {
    const requestTitle = `Task transcript ${runId}`;
    await counselor.goto(`/students/${studentId}/documents`);
    await counselor.getByRole("button", { name: "Request Document", exact: true }).click();
    const requestForm = counselor.locator('form:has(textarea[name="note"])');
    await requestForm.locator('input[name="title"]').fill(requestTitle);
    await requestForm.locator('select[name="student_id"]').selectOption(studentId);
    await requestForm.locator('select[name="category"]').selectOption("transcript");
    await requestForm.getByRole("button", { name: "Send Request" }).click();
    await expect(requestForm).toBeHidden();
    const requestAnchor = await counselor.locator("li", { hasText: requestTitle }).getAttribute("id");
    const requestId = requestAnchor!.replace("request-", "");
    await counselor.goto(`/students/${studentId}/tasks`);
    await counselor.getByRole("button", { name: "Create Task", exact: true }).first().click();
    const taskForm = counselor.locator('form:has(input[name="title"])');
    await taskForm.locator('input[name="title"]').fill(`Transcript review ${runId}`);
    await taskForm.locator('select[name="visibility_scope"]').selectOption("student");
    await taskForm.getByRole("button", { name: "Create Task", exact: true }).click();
    await expect(taskForm).toBeHidden();
    await counselor.getByRole("link", { name: `Transcript review ${runId}`, exact: true }).click();
    await counselor.getByLabel("Linked work").selectOption(`document_request:${requestId}`);
    await counselor.getByRole("button", { name: "Save linked work" }).click();
    await expect(counselor.getByRole("link", { name: "Open document request", exact: true })).toBeVisible();
    await counselor.getByLabel("Completion requirement").selectOption("review_required");
    await counselor.getByLabel("Reviewer", { exact: true }).selectOption({ label: "E2E Counselor" });
    await counselor.getByRole("button", { name: "Save completion requirement" }).click();
    const taskId = counselor.url().split("/").pop()!;
    await student.goto(`/task/${taskId}`);
    await expect(student.locator(`#request-${requestId}`)).toBeVisible();
    await student.locator(`#request-${requestId}`).getByRole("button", { name: "Upload", exact: true }).click();
    const uploadForm = student.locator('form:has(input[name="request_id"])');
    await expect(uploadForm.locator('input[name="task_id"]')).toHaveValue(taskId);
    await expect(uploadForm.locator('input[name="student_id"]')).toHaveValue(studentId);
    await uploadForm.locator('input[name="file"]').setInputFiles({ name: "transcript.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 ${requestTitle}`) });
    await uploadForm.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(uploadForm).toBeHidden();
    await expect(student.getByText("The requested document has been uploaded.")).toBeVisible();
    await expect(student.getByRole("button", { name: "Mark complete", exact: true })).toHaveCount(0);
    await student.getByRole("button", { name: "Submit for review", exact: true }).click();
    await expect(student.getByText("Submitted for review.", { exact: true })).toBeVisible();
    await counselor.goto("/tasks/review");
    await counselor.getByRole("link", { name: `Transcript review ${runId}`, exact: true }).click();
    await expect(counselor.getByText(`Submitted document: ${requestTitle}`, { exact: true })).toBeVisible();
    await counselor.getByRole("button", { name: "Approve submission" }).click();
    await expect(counselor.getByText("Complete.", { exact: true })).toBeVisible();
  });

  test("9. counselor and parent exchange messages", async () => {
    const messageBody = `Welcome aboard ${runId}! Let's plan the semester.`;
    await counselor.goto("/messages");
    // Two "New Conversation" buttons render (header + empty state) — either
    // opens the same modal.
    await counselor
      .getByRole("button", { name: "New Conversation" })
      .first()
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
    // .first(): the reply renders in both the thread bubble and the
    // conversation-list preview, like every other message assertion here.
    await expect(parent1.getByText(replyBody).first()).toBeVisible();

    // The counselor sees the reply. (The notification email to offline
    // participants is dispatched via Inngest + Resend — asserted by the
    // unit/integration layers, not observable from the browser.)
    await counselor.goto("/messages");
    await expect(counselor.getByText(replyBody).first()).toBeVisible();
  });

  test("10. counselor builds a categorized college list with rounds; fit analysis renders", async () => {
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

  test("11. application created from list with editable deadline and checklist", async () => {
    await counselor.goto(`/students/${studentId}/colleges`);
    // Row actions → Create application on the HARVARD row specifically —
    // the board link clicked below is /Harvard/i, and "first row" depends on
    // the list's category grouping/sort, which this test must not assume.
    await counselor
      .locator("tr")
      .filter({ hasText: /Harvard/i })
      .getByRole("button", { name: "Row actions" })
      .click();
    // The success signal here is the action POST completing — the component
    // only router.refresh()es on success, with no distinct UI marker — so
    // await the response before navigating: a goto would abort the in-flight
    // action POST and destroy the write (the step-3 reload() lesson).
    const createApplicationResponse = counselor.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes(`/students/${studentId}/colleges`)
    );
    await counselor
      .getByRole("button", { name: "Create application" })
      .click();
    await createApplicationResponse;
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
    await editForm.getByRole("button", { name: "Preview changes" }).click();
    await editForm.getByRole("button", { name: "Accept changes" }).click();
    await expect(counselor.getByText(/Nov 1/i).first()).toBeVisible();
  });

  test("12. essay shared with student, edited in portal, reviewed, finalized", async () => {
    const essayTitle = `Personal statement ${runId}`;
    await counselor.goto("/essays");
    // Header + empty-state both render a "New Essay" button.
    await counselor.getByRole("button", { name: "New Essay" }).first().click();
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

    // Link an existing essay from the student's task workspace.
    await counselor.goto(`/students/${studentId}/tasks`);
    await counselor.getByRole("link", { name: `Student-owned work ${runId}`, exact: true }).click();
    await counselor.getByLabel("Linked work").selectOption(`essay:${essayId}`);
    await counselor.getByRole("button", { name: "Save linked work" }).click();
    await expect(counselor.getByRole("link", { name: "Open essay", exact: true })).toHaveAttribute("href", `/essays/${essayId}`);
    await counselor.getByLabel("Completion requirement").selectOption("review_required");
    await counselor.getByLabel("Reviewer", { exact: true }).selectOption({ label: "E2E Counselor" });
    await counselor.getByRole("button", { name: "Save completion requirement" }).click();
    const linkedTaskId = counselor.url().split("/").pop()!;
    await student.goto(`/task/${linkedTaskId}`);
    await student.getByRole("link", { name: "Open essay", exact: true }).click();
    await student.waitForURL(`**/student-essays/${essayId}`);
    // The existing editor and review lifecycle are unchanged.

    // Target the essay body by its placeholder — the page renders a second
    // textarea (the feedback composer), and filling that one leaves the body
    // unchanged, so "Save Draft" (which only appears with unsaved changes)
    // never exists.
    await student
      .getByPlaceholder("Start writing...")
      .fill(
        `Sophomore year I rebuilt our robotics code base from scratch… (${runId})`
      );
    await student.getByRole("button", { name: "Save Draft" }).click();
    await student
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(student.getByText("With your counselor")).toBeVisible();

    // The task queue and the standalone editor share the exact submission.
    await parent1.goto(`/task/${linkedTaskId}`);
    await expect(parent1.getByRole("button", { name: "Approve submission" })).toHaveCount(0);
    await expect(parent1.getByText(/Submitted essay — version/)).toHaveCount(0);
    await counselor.goto("/tasks/review");
    await counselor.getByRole("button", {name: /^Notifications/}).click();
    const reviewNotice=counselor.getByRole("link", {name: new RegExp(`Ready for your review: Student-owned work ${runId}`)});
    await expect(reviewNotice).toHaveAttribute("href", `/task/${linkedTaskId}`);
    await reviewNotice.click();
    await counselor.getByLabel("Review feedback (required for changes)").fill("Explain the impact on the team.");
    await counselor.getByRole("button", { name: "Request changes", exact: true }).click();
    // The other persona must read after the counselor action has committed.
    await expect(counselor.getByRole("button", { name: "Request changes", exact: true })).toBeHidden();
    await expect(counselor.getByText("Changes requested", { exact: true })).toBeVisible();
    await student.goto(`/student-essays/${essayId}`);
    await student.getByRole("button", {name: /^Notifications/}).click();
    await expect(student.getByRole("link", {name: new RegExp(`Changes requested: Student-owned work ${runId}`)})).toHaveAttribute("href", `/task/${linkedTaskId}`);
    await student.getByRole("button", {name: /^Notifications/}).click();
    await expect(student.getByText("Revision requested", { exact: true })).toBeVisible();
    await student.getByPlaceholder("Start writing...").fill(`Our entire team could now contribute to the robot. ${runId}`);
    await student.getByRole("button", { name: "Submit for review", exact: true }).click();
    await expect(student.getByText("With your counselor")).toBeVisible();
    await counselor.goto(`/tasks/${linkedTaskId}`);
    await counselor.getByRole("button", { name: "Approve submission" }).click();
    await expect(counselor.getByText("Complete.", { exact: true })).toBeVisible();
    // The counselor can finalize the same accepted version in the existing editor.
    await counselor.goto(`/essays/${essayId}`);
    const statusSelect = counselor.locator(
      'select:has(option[value="revision_requested"])'
    );
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

  test("13. decision recorded and visible in portals and reports", async () => {
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

  test("13b. the decision feeds the college scattergram: staff see the named point, portals see the anonymized history gate", async () => {
    // Fix plan 13.2. Give the student a GPA so the decision is plottable
    // (step 5 recorded the SAT); every other field on this form defaults
    // from the row, so saving changes nothing else.
    await counselor.goto(`/students/${studentId}`);
    await counselor.getByRole("button", { name: "Edit Profile" }).click();
    const editForm = counselor.locator('form:has(input[name="gpa_unweighted"])');
    await editForm.locator('input[name="gpa_unweighted"]').fill("3.85");
    await editForm.getByRole("button", { name: "Save Changes" }).click();
    await expect(editForm).toBeHidden();

    // The Decision Roster links each college to its scattergram.
    await counselor.goto("/reports");
    await counselor
      .getByRole("link", { name: /Harvard/i })
      .first()
      .click();
    await counselor.waitForURL(/\/college-planning\/[0-9a-f-]+#admissions-history$/);
    const outcomes = counselor.locator("#admissions-history");
    // Heading role: the chart's accessible <title> repeats the phrase.
    await expect(
      outcomes.getByRole("heading", { name: /Admission outcomes at/ })
    ).toBeVisible();
    await expect(outcomes.getByTestId("scattergram-summary")).toContainText(
      "1 decision"
    );
    await expect(outcomes.getByTestId("scattergram-summary")).toContainText(
      "1 accepted"
    );
    // The point is plotted (GPA + SAT on file) and the table names the student.
    await expect(outcomes.getByTestId("scattergram-point")).toHaveCount(1);
    await outcomes.getByRole("button", { name: "Show table" }).click();
    await expect(
      outcomes.getByTestId("scattergram-table").getByText(studentName)
    ).toBeVisible();

    // Portals: the history section exists on the Harvard card but stays
    // gated below the privacy floor (one decision could identify a
    // classmate), and it never names anyone.
    for (const [page, path] of [
      [student, "/student-colleges"],
      [parent1, "/family-colleges"],
    ] as const) {
      await page.goto(path);
      const history = page
        .locator('[data-testid="college-outcome-history"][data-college*="Harvard" i]')
        .first();
      await expect(history).toBeVisible();
      await expect(history).toContainText("1 decision recorded");
      await history.locator("summary").click();
      await expect(history).toContainText(/at least 3 decisions/);
      await expect(history.getByTestId("scattergram-point")).toHaveCount(0);
      await expect(history.getByText(studentName)).toHaveCount(0);
    }
  });

  test("14. isolation: cross-firm and cross-role access is denied at the route level", async () => {
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

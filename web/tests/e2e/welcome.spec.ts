import {
  test,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";

/**
 * The /welcome onboarding flow (fix plan 2.2, completed 2026-08-13): what a
 * sign-up OUTSIDE the invitation system gets. Firms are never provisioned as
 * a side effect of authentication — counselors create one explicitly, and a
 * client whose email matches records a firm already created gets a guided
 * link into the right portal instead of accidentally becoming the owner of
 * an empty firm.
 *
 * Same environment contract and self-skip behavior as golden-path.spec.ts.
 */

const env = e2eEnv();
const runId = Date.now().toString(36);

const inviteDomain = env?.inviteDomain ?? "example.com";
const coldCounselorEmail = `w-counselor-${runId}+clerk_test@${inviteDomain}`;
const addedParentEmail = `w-parent-${runId}+clerk_test@${inviteDomain}`;
const household = `Welcome Household ${runId}`;
const parentName = `Wendy Welcome${runId}`;
const firmName = `Welcome Firm ${runId}`;

test.describe.serial("welcome: sign-ups outside the invitation system", () => {
  test.skip(!env, "Clerk test-auth env not configured — see docs/E2E.md");

  let coldCtx: BrowserContext;
  let parentCtx: BrowserContext;
  let ownerCtx: BrowserContext;
  let cold: Page;
  let parent: Page;
  let owner: Page;

  test.beforeAll(async ({ browser }) => {
    [coldCtx, parentCtx, ownerCtx] = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    cold = await coldCtx.newPage();
    parent = await parentCtx.newPage();
    owner = await ownerCtx.newPage();
  });

  test.afterAll(async () => {
    await Promise.all(
      [coldCtx, parentCtx, ownerCtx].filter(Boolean).map((c) => c.close())
    );
  });

  test("a cold sign-up gets no firm until the explicit create action", async () => {
    await ensureClerkUser(coldCounselorEmail, "Wanda", `Welcomer${runId}`);
    await signInAs(cold, coldCounselorEmail);

    // Authenticated but unaffiliated: the dashboard hands off to /welcome
    // instead of silently provisioning a firm.
    await expect(cold).toHaveURL(/\/welcome/);
    await expect(
      cold.getByRole("button", { name: "Create your firm" })
    ).toBeVisible();
    // The client guidance names the signed-up address rather than sending
    // people to hunt for an "invitation".
    await expect(cold.getByText(coldCounselorEmail)).toBeVisible();

    await cold.locator('input[name="firm_name"]').fill(firmName);
    await cold.getByRole("button", { name: "Create your firm" }).click();
    await cold.waitForURL(/\/dashboard/);
    await expect(
      cold.locator('aside[aria-label="Main navigation"]')
    ).toBeVisible();
  });

  test("an added-but-never-invited family member gets the guided link into the family portal", async () => {
    // Owner creates a household and adds a parent by email — no portal
    // invitation is ever sent. This is the "client wandered in from an
    // agreement email" shape.
    await signInAs(owner, env!.ownerEmail);
    await owner.goto("/families/new");
    await owner.locator('input[name="household_name"]').fill(household);
    await owner.getByRole("button", { name: "Create Family" }).click();
    await owner.waitForURL(/\/families\/[0-9a-f-]{36}$/);

    const [first, last] = parentName.split(" ");
    await owner.getByRole("button", { name: "+ Add Member" }).click();
    const form = owner.locator('form:has(input[name="email"])');
    await form.locator('input[name="first_name"]').fill(first);
    await form.locator('input[name="last_name"]').fill(last);
    await form.locator('input[name="email"]').fill(addedParentEmail);
    await form
      .locator('select[name="relationship_type"]')
      .selectOption("parent");
    await form.getByRole("button", { name: "Add Member" }).click();
    await expect(owner.getByText(parentName)).toBeVisible();

    // The parent signs up cold with the address on file and is guided the
    // rest of the way — named firm, named household, one explicit consent.
    await ensureClerkUser(addedParentEmail, first, last);
    await signInAs(parent, addedParentEmail);
    await expect(parent).toHaveURL(/\/welcome/);
    await expect(parent.getByText(/added you to CounselWorks/)).toBeVisible();
    await expect(parent.getByText(household)).toBeVisible();

    await parent.getByRole("button", { name: /Link my account/ }).click();
    await parent.waitForURL(/\/family-dashboard/);

    // The link satisfied the affiliation: the owner sees the member's portal
    // as active on the family page (both claim surfaces agree).
    await expect(
      parent.locator('aside[aria-label="Main navigation"]')
    ).toBeVisible();
  });
});

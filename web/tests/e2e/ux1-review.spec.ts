import { test, expect } from "@playwright/test";
import { e2eEnv } from "./helpers/env";
import { signInAs } from "./helpers/clerk";

/** Read-only acceptance against the preserved fictional interactive-review firm.
 * Opt in locally with E2E_UX_REVIEW=1; the regular golden path creates its own
 * data and carries the equivalent UX1 regressions in step 8a.
 */
test.describe("UX1 preserved review fixtures", () => {
  test.skip(!e2eEnv() || process.env.E2E_UX_REVIEW !== "1", "Requires the local UX review fixtures; see docs/E2E.md");
  test.beforeEach(() => {
    expect(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  });
  const sam = "a0000000-0000-4000-8000-000000000041";
  const family = "a0000000-0000-4000-8000-000000000021";
  const own = ["Junior year kickoff", "Confirm senior-year course rigor", "Senior-year transition meeting"];
  const others = ["Take PSAT/NMSQT", "Spring SAT/ACT", "Review college budget with Sam"];

  test("owner sees four staff with correct roles and no client controls", async ({ page }) => {
    await signInAs(page, "cw-ux-owner+clerk_test@example.com", "/settings");
    const roles = page.getByRole("combobox", { name: /^Role for / });
    await expect(roles).toHaveCount(4);
    await expect(page.getByText("4 members", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Role for Olivia Ownersen", exact: true })).toHaveValue("firm_owner");
    await expect(page.getByRole("combobox", { name: "Role for Carl Counselman", exact: true })).toHaveValue("counselor");
    for (const name of ["Sam Studentson", "Paula Parent", "Peter Parent"]) {
      await expect(page.getByRole("combobox", { name: `Role for ${name}`, exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Remove ${name}`, exact: true })).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await roles.nth(1).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Remove Carl Counselman", exact: true })).toBeFocused();
  });

  test("counselor personal URLs and keyboard return keep mixed owners out; workspaces retain them", async ({ page }) => {
    await signInAs(page, "cw-ux-counselor+clerk_test@example.com", "/tasks");
    for (const url of ["/tasks", "/tasks?view=my", "/tasks?view=invalid"]) {
      await page.goto(url);
      for (const title of own) await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
      for (const title of others) await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
    }
    for (const view of ["Team Tasks", "Student Tasks"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      for (const title of [...own, ...others]) await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "My Tasks", exact: true }).focus();
    await page.keyboard.press("Enter");
    for (const title of others) await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
    for (const path of [`/students/${sam}/tasks`, `/families/${family}/tasks`]) {
      await page.goto(path);
      for (const title of [...own, ...others]) await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "My Tasks", exact: true })).toHaveCount(0);
    }
  });

  test("student retains personal actions and private staff work stays hidden", async ({ page }) => {
    await signInAs(page, "cw-ux-student+clerk_test@example.com", "/student-tasks");
    await expect(page.getByRole("heading", { name: "My work", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Confirm senior-year course rigor", exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Take PSAT/NMSQT", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Take PSAT/NMSQT", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toBeVisible();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/student-dashboard$/);
  });

  test("parent retains completed ownership and cannot reach staff settings", async ({ page }) => {
    await signInAs(page, "cw-ux-parent+clerk_test@example.com", "/family-tasks");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Review college budget with Sam", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Review college budget with Sam", exact: true })).toBeVisible();
    await expect(page.getByText("Paula Parent", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reopen task", exact: true })).toBeVisible();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/family-dashboard$/);
  });
});

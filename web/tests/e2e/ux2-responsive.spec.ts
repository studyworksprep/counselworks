import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { e2eEnv } from "./helpers/env";
import { signInAs } from "./helpers/clerk";

const widths = [390, 768, 1024, 1057, 1366];
const studentPath = "/students/a0000000-0000-4000-8000-000000000041";
test.describe("UX2 responsive review fixtures", () => {
  test.skip(!e2eEnv() || process.env.E2E_UX_REVIEW !== "1", "Requires preserved local review fixtures");
  test.beforeEach(() => {
    expect(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  });
  for (const role of ["owner", "counselor"]) {
    test(`${role}: workspace and task controls fit all required widths`, async ({ page }, testInfo) => {
      await signInAs(page, `cw-ux-${role}+clerk_test@example.com`, studentPath);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const collapsed of [false, true]) {
          if (width < 768 && collapsed) continue;
          await page.context().addCookies([{ name: "cw_sidebar", value: collapsed ? "collapsed" : "open", url: "http://localhost:3000" }]);
          await page.goto(studentPath);
          await expect(page.getByRole("heading", { name: "Staff Assignments" })).toBeVisible();
          // Synthetic display-only stress: keep persisted review records unchanged.
          await page.getByRole("heading", { name: "Sam Studentson", exact: true }).evaluate(el => { el.textContent = "Sam Alexandra-Montgomery Studentson-Worthington"; });
          await page.getByText("Balance due", { exact: true }).evaluate(el => { if (el.nextElementSibling) el.nextElementSibling.textContent = "$12,345,678.90"; });
          await page.getByText("Carl Counselman", { exact: true }).last().evaluate(el => { el.textContent = "Carl Alexander Counselman-Worthington"; });
          const stepTitle = page.getByRole("link", { name: "Junior year kickoff", exact: true });
          await expect(stepTitle).toBeVisible();
          expect((await stepTitle.boundingBox())!.width).toBeGreaterThan(80);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          await page.screenshot({ path: testInfo.outputPath(`workspace-${width}-${collapsed ? "collapsed" : "expanded"}.png`), fullPage: true });
          await page.goto(`${studentPath}/tasks`);
          const task = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Junior year kickoff", exact: true }) });
          await expect(task).toBeVisible();
          for (const column of ["status", "assigned_to", "due_at", "actions"]) {
            const cell = task.locator(`[data-column="${column}"]`);
            await expect(cell).toBeVisible();
            const box = await cell.boundingBox();
            expect(box!.x).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          await page.screenshot({ path: testInfo.outputPath(`tasks-${width}-${collapsed ? "collapsed" : "expanded"}.png`), fullPage: true });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(studentPath);
      await page.getByRole("button", { name: "Later student sections" }).focus();
      await page.keyboard.press("Enter");
      const familyTab = page.getByRole("navigation", { name: "Student sections" }).getByRole("link", { name: "Family & Billing" });
      await familyTab.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${studentPath}/family`);
      await page.goto("/tasks?view=team");
      await page.getByRole("button", { name: "Due Date", exact: true }).click();
      await expect(page.getByRole("columnheader", { name: "Due Date" })).toHaveAttribute("aria-sort", "ascending");
      const accessibility = await new AxeBuilder({ page }).include(".task-table-container").analyze();
      expect(accessibility.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
    });
  }
  for (const [role, path, task] of [
    ["student", "/student-tasks", "Take PSAT/NMSQT"],
    ["parent", "/family-tasks", "Review college budget with Sam"],
  ]) {
    test(`${role}: portal layout stays stacked and keyboard usable`, async ({ page }, testInfo) => {
      await signInAs(page, `cw-ux-${role}+clerk_test@example.com`, path);
      for (const width of [390, 1366]) {
        await page.setViewportSize({ width, height: 844 });
        await page.getByRole("link", { name: task, exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name: task, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`portal-${width}.png`), fullPage: true });
        await page.goto(role === "student" ? "/student-dashboard" : "/family-dashboard");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
        await page.goto(path);
      }
    });
  }
});

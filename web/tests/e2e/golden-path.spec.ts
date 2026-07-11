import { test } from "@playwright/test";

/**
 * The golden-path acceptance scenario from docs/FIX_PLAN.md §1.
 *
 * Each step is marked `fixme` until the phase that enables it lands; flipping
 * a step to a real test is part of that phase's definition of done. The suite
 * runs against E2E_BASE_URL with the two-firm fixture data from
 * supabase/seed/test-fixtures.sql applied.
 */
test.describe("golden path: signed family → final decision", () => {
  test.fixme(
    "1. counselor creates a family with two parents and a 10th-grade student",
    async () => {
      // Existing flow (families/new, students/new) — needs Clerk test auth
      // plumbing before it can be exercised here.
    },
  );

  test.fixme(
    "2. student and both parents accept portal invitations and land in their portals",
    async () => {
      // Blocked on Phase 2 (parent invitations do not exist yet).
    },
  );

  test.fixme(
    "3. counselor records intake data and it drives recommendations/fit",
    async () => {
      // Phase 4 landed (profile columns, counselor editor, portal intake);
      // flip pending Clerk test-auth plumbing.
    },
  );

  test.fixme(
    "4. counselor schedules a kickoff meeting with student and parent attendees",
    async () => {
      // Phase 3 landed (client attendees, edit-safe defaults, summaries);
      // flip pending Clerk test-auth plumbing.
    },
  );

  test.fixme(
    "5. parent uploads a transcript; staff-only documents stay inaccessible to portals",
    async () => {
      // Phases 1+3 landed (portal upload, visibility-checked downloads);
      // flip pending Clerk test-auth plumbing.
    },
  );

  test.fixme(
    "6. sophomore workflow applied; student completes a portal task; step completes",
    async () => {
      // Workflow engine exists today — needs auth plumbing only.
    },
  );

  test.fixme(
    "7. counselor and parent exchange messages with email notification",
    async () => {
      // Phase 3 landed (participant-scoped conversations, portal-initiated
      // threads, email notifications); flip pending Clerk test-auth plumbing.
    },
  );

  test.fixme(
    "8. counselor builds a categorized college list with rounds; fit analysis renders",
    async () => {
      // Phase 4 landed (fit analysis unbroken, add-to-list from
      // Discover/Recommend, balance nudge); flip pending Clerk test-auth
      // plumbing. Research notes UI unblocked by the fit fix.
    },
  );

  test.fixme(
    "9. application created from list with editable deadline and checklist",
    async () => {
      // Blocked on Phase 5 (application detail page + checklist).
    },
  );

  test.fixme(
    "10. essay shared with student, edited in portal, coach-reviewed, finalized",
    async () => {
      // Blocked on Phase 5 (essay visibility + portal editing).
    },
  );

  test.fixme(
    "11. decision recorded and visible in portals and reports",
    async () => {
      // Blocked on Phase 5 (decision recording UI).
    },
  );

  test.fixme(
    "12. isolation: cross-firm and cross-role access is denied",
    async () => {
      // Phase 1 landed: enforced by supabase/tests/isolation.sql (run in CI)
      // and tests/unit/authorize.test.ts. This browser-level double-check
      // flips to a real test once Clerk test-auth plumbing exists (Phase 2).
    },
  );
});

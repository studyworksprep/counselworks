import { describe, expect, it } from "vitest";
import {
  conversationAccessAllowed,
  documentReadAllowed,
  taskMutationAllowed,
  type StudentRelationship,
} from "@/lib/auth/authorize";

/**
 * These matrices encode the fixes for the audited authorization holes:
 * portal users downloading staff-only documents by UUID, reading/posting in
 * arbitrary conversations, and flipping any task in the firm. Changing a
 * `false` here to `true` is a security decision — get it reviewed.
 */

const SCOPES = ["staff", "student", "family", "firm"] as const;

describe("documentReadAllowed", () => {
  it("staff with access read every scope", () => {
    for (const scope of SCOPES) {
      expect(documentReadAllowed(scope, "firm_staff"), scope).toBe(true);
      expect(documentReadAllowed(scope, "assigned_staff"), scope).toBe(true);
    }
  });

  it("unassigned scoped staff read nothing by UUID", () => {
    for (const scope of SCOPES) {
      expect(documentReadAllowed(scope, "unassigned_staff"), scope).toBe(false);
    }
  });

  it("students never read staff-scoped documents", () => {
    expect(documentReadAllowed("staff", "own_student")).toBe(false);
    expect(documentReadAllowed("student", "own_student")).toBe(true);
    expect(documentReadAllowed("family", "own_student")).toBe(true);
    expect(documentReadAllowed("firm", "own_student")).toBe(true);
  });

  it("parents never read staff- or student-scoped documents", () => {
    expect(documentReadAllowed("staff", "family_parent")).toBe(false);
    expect(documentReadAllowed("student", "family_parent")).toBe(false);
    expect(documentReadAllowed("family", "family_parent")).toBe(true);
    expect(documentReadAllowed("firm", "family_parent")).toBe(true);
  });

  it("unrelated users read nothing", () => {
    for (const scope of SCOPES) {
      expect(documentReadAllowed(scope, "none"), scope).toBe(false);
    }
  });
});

describe("taskMutationAllowed", () => {
  const base = {
    visibilityScope: "staff",
    isAssignee: false,
    isCreator: false,
  };

  it("firm-wide staff mutate any task", () => {
    expect(
      taskMutationAllowed({
        ...base,
        role: "firm_owner",
        relationship: "firm_staff",
      }),
    ).toBe(true);
  });

  it("scoped staff need assignment, assigneeship, or authorship", () => {
    const counselor = (
      relationship: StudentRelationship,
      extra: Partial<typeof base> = {},
    ) =>
      taskMutationAllowed({
        ...base,
        role: "counselor",
        relationship,
        ...extra,
      });

    expect(counselor("assigned_staff")).toBe(true);
    expect(counselor("unassigned_staff")).toBe(false);
    expect(counselor("unassigned_staff", { isAssignee: true })).toBe(true);
    expect(counselor("unassigned_staff", { isCreator: true })).toBe(true);
  });

  it("students complete only their own portal-visible tasks", () => {
    const student = (
      relationship: StudentRelationship,
      visibilityScope: string,
    ) =>
      taskMutationAllowed({
        role: "student",
        relationship,
        visibilityScope,
        isAssignee: false,
        isCreator: false,
      });

    expect(student("own_student", "student")).toBe(true);
    expect(student("own_student", "family")).toBe(true);
    expect(student("own_student", "firm")).toBe(true);
    // Staff-scoped tasks are invisible in the portal; UUIDs must not help.
    expect(student("own_student", "staff")).toBe(false);
    // Another student's task, even if the UUID leaks.
    expect(student("none", "student")).toBe(false);
  });

  it("parents cannot mutate tasks (read-only by design)", () => {
    expect(
      taskMutationAllowed({
        role: "parent_guardian",
        relationship: "family_parent",
        visibilityScope: "family",
        isAssignee: false,
        isCreator: false,
      }),
    ).toBe(false);
  });
});

describe("conversationAccessAllowed", () => {
  it("staff access firm conversations; portal roles need participation", () => {
    expect(conversationAccessAllowed("counselor", false)).toBe(true);
    expect(conversationAccessAllowed("firm_owner", false)).toBe(true);
    expect(conversationAccessAllowed("student", false)).toBe(false);
    expect(conversationAccessAllowed("student", true)).toBe(true);
    expect(conversationAccessAllowed("parent_guardian", false)).toBe(false);
    expect(conversationAccessAllowed("parent_guardian", true)).toBe(true);
  });
});

describe("isPortalInviteMetadata (auto-provision gate)", async () => {
  const { isPortalInviteMetadata } = await import("@/lib/auth/resolve");

  it("recognizes both portal invite kinds", () => {
    expect(
      isPortalInviteMetadata({ kind: "student_invite", placeholder_user_id: "x" }),
    ).toBe(true);
    expect(
      isPortalInviteMetadata({ kind: "parent_invite", placeholder_user_id: "x" }),
    ).toBe(true);
  });

  it("rejects everything else, so normal signups still auto-provision", () => {
    expect(isPortalInviteMetadata(null)).toBe(false);
    expect(isPortalInviteMetadata(undefined)).toBe(false);
    expect(isPortalInviteMetadata({})).toBe(false);
    expect(isPortalInviteMetadata({ kind: "something_else" })).toBe(false);
    expect(isPortalInviteMetadata("student_invite")).toBe(false);
  });
});

describe("isPlaceholderUser (portal account detection)", async () => {
  const { isPlaceholderUser } = await import("@/lib/auth/resolve");

  it("treats the current invited_ prefix as a placeholder", () => {
    expect(isPlaceholderUser("invited_9a1b2c3d-0000-0000-0000-000000000000")).toBe(
      true,
    );
  });

  it("treats the legacy pending_ prefix as a placeholder", () => {
    // Rows written by older builds during a mixed-version deploy window must
    // never read as active portal accounts.
    expect(isPlaceholderUser("pending_9a1b2c3d-0000-0000-0000-000000000000")).toBe(
      true,
    );
  });

  it("treats a real Clerk user id as an active account", () => {
    expect(isPlaceholderUser("user_2xYzAbCdEfGhIjKlMnOpQrStUv")).toBe(false);
  });
});

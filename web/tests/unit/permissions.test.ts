import { describe, expect, it } from "vitest";
import {
  ROLE_PERMISSIONS,
  hasPermission,
  canViewStudent,
  canEditStudent,
  requirePermission,
  getPermissionContext,
} from "@/modules/permissions/service";

const STUDENT_A = "11111111-1111-4111-8111-111111111111";
const STUDENT_B = "22222222-2222-4222-8222-222222222222";

function ctx(role: string, assignedStudentIds: string[] = []) {
  return getPermissionContext("user-1", "firm-1", role, assignedStudentIds);
}

describe("ROLE_PERMISSIONS matrix", () => {
  it("defines every role used by the app", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [
        "counselor",
        "essay_coach",
        "firm_admin",
        "firm_owner",
        "parent_guardian",
        "read_only_staff",
        "student",
        "tutor",
      ].sort(),
    );
  });

  it("grants firm management only to owner and admin", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      const expected = role === "firm_owner" || role === "firm_admin";
      expect(hasPermission(ctx(role), "manage_firm"), role).toBe(expected);
      expect(hasPermission(ctx(role), "manage_staff"), role).toBe(expected);
    }
  });

  it("never grants portal roles any mutation or staff permission", () => {
    for (const role of ["student", "parent_guardian"]) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(permission.startsWith("view_"), `${role}:${permission}`).toBe(
          true,
        );
      }
    }
  });

  it("reserves impersonation for the firm owner", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(hasPermission(ctx(role), "impersonate"), role).toBe(
        role === "firm_owner",
      );
    }
  });
});

describe("hasPermission", () => {
  it("denies unknown roles entirely", () => {
    expect(hasPermission(ctx("intruder"), "view_student")).toBe(false);
  });
});

describe("student scoping", () => {
  it("lets firm-wide roles reach any student", () => {
    for (const role of ["firm_owner", "firm_admin", "read_only_staff"]) {
      expect(canViewStudent(ctx(role), STUDENT_A), role).toBe(true);
    }
  });

  it("limits counselors to their assigned students", () => {
    const counselor = ctx("counselor", [STUDENT_A]);
    expect(canViewStudent(counselor, STUDENT_A)).toBe(true);
    expect(canViewStudent(counselor, STUDENT_B)).toBe(false);
    expect(canEditStudent(counselor, STUDENT_A)).toBe(true);
    expect(canEditStudent(counselor, STUDENT_B)).toBe(false);
  });

  it("never lets read-only staff edit, even firm-wide", () => {
    expect(canEditStudent(ctx("read_only_staff"), STUDENT_A)).toBe(false);
  });

  it("never lets portal roles edit students", () => {
    expect(canEditStudent(ctx("student", [STUDENT_A]), STUDENT_A)).toBe(false);
    expect(
      canEditStudent(ctx("parent_guardian", [STUDENT_A]), STUDENT_A),
    ).toBe(false);
  });
});

describe("requirePermission", () => {
  it("throws for missing permissions and passes for granted ones", () => {
    expect(() => requirePermission(ctx("counselor"), "manage_staff")).toThrow(
      /Permission denied/,
    );
    expect(() =>
      requirePermission(ctx("firm_admin"), "manage_staff"),
    ).not.toThrow();
  });
});

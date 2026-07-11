"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
  resolveStudentRelationship,
} from "../auth/authorize";

const SCHOOL_TYPES = new Set(["", "public", "private"]);
const AID_INTEREST = new Set(["", "yes", "no", "unsure"]);

function parseIntInRange(
  raw: FormDataEntryValue | null,
  min: number,
  max: number
): number | null | undefined {
  const text = ((raw as string) ?? "").trim();
  if (text === "") return null;
  const value = Number.parseInt(text, 10);
  if (Number.isNaN(value) || value < min || value > max) return undefined;
  return value;
}

function parseGeoPreferences(raw: FormDataEntryValue | null): string[] {
  return ((raw as string) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((s) => s.slice(0, 40));
}

/** Parse a JSON-array field serialized by the row editors; null on failure. */
function parseJsonRows(
  raw: FormDataEntryValue | null,
  allowedKeys: string[]
): unknown[] | null {
  const text = ((raw as string) ?? "").trim();
  if (text === "") return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length > 50) return null;
    return parsed.map((item) => {
      const obj = item as Record<string, unknown>;
      const clean: Record<string, string> = {};
      for (const key of allowedKeys) {
        if (typeof obj[key] === "string" && obj[key]) {
          clean[key] = (obj[key] as string).slice(0, 300);
        }
      }
      return clean;
    });
  } catch {
    return null;
  }
}

interface ProfileFields {
  sat_score?: number | null;
  act_score?: number | null;
  geographic_preferences?: string[];
  target_school_type?: string | null;
  financial_aid_needed?: boolean;
  financial_aid_interest?: string | null;
  budget_range?: string | null;
  citizenship_status?: string | null;
  testing_summary_json?: unknown[];
  activities_json?: unknown[];
  awards_json?: unknown[];
}

/**
 * Shared field extraction. `fields` names which groups the caller may edit —
 * this is how the parent intake is prevented from touching test scores and
 * the student intake from touching family financials.
 */
function extractProfileFields(
  formData: FormData,
  groups: Array<"testing" | "preferences" | "financial" | "records">
): ProfileFields | { error: string } {
  const out: ProfileFields = {};

  if (groups.includes("testing")) {
    const sat = parseIntInRange(formData.get("sat_score"), 400, 1600);
    if (sat === undefined) return { error: "SAT score must be 400–1600" };
    const act = parseIntInRange(formData.get("act_score"), 1, 36);
    if (act === undefined) return { error: "ACT score must be 1–36" };
    out.sat_score = sat;
    out.act_score = act;
  }

  if (groups.includes("preferences")) {
    out.geographic_preferences = parseGeoPreferences(
      formData.get("geographic_preferences")
    );
    const schoolType = ((formData.get("target_school_type") as string) ?? "")
      .trim()
      .toLowerCase();
    if (!SCHOOL_TYPES.has(schoolType)) {
      return { error: "Invalid school type preference" };
    }
    out.target_school_type = schoolType || null;
  }

  if (groups.includes("financial")) {
    out.financial_aid_needed = formData.get("financial_aid_needed") === "on";
    const aidInterest = ((formData.get("financial_aid_interest") as string) ?? "")
      .trim()
      .toLowerCase();
    if (!AID_INTEREST.has(aidInterest)) {
      return { error: "Invalid financial aid interest" };
    }
    out.financial_aid_interest = aidInterest || null;
    out.budget_range =
      ((formData.get("budget_range") as string) ?? "").trim().slice(0, 100) ||
      null;
    out.citizenship_status =
      ((formData.get("citizenship_status") as string) ?? "")
        .trim()
        .slice(0, 100) || null;
  }

  if (groups.includes("records")) {
    const testing = parseJsonRows(formData.get("testing_summary_json"), [
      "test_name",
      "score",
    ]);
    const activities = parseJsonRows(formData.get("activities_json"), [
      "name",
      "role",
      "description",
    ]);
    const awards = parseJsonRows(formData.get("awards_json"), [
      "name",
      "level",
      "year",
    ]);
    if (!testing || !activities || !awards) {
      return { error: "Invalid list data" };
    }
    out.testing_summary_json = testing;
    out.activities_json = activities;
    out.awards_json = awards;
  }

  return out;
}

/** Staff profile editor: every group at once. */
export async function updateStudentProfile(
  studentId: string,
  formData: FormData
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Student not found" };
    throw e;
  }

  const fields = extractProfileFields(formData, [
    "testing",
    "preferences",
    "financial",
    "records",
  ]);
  if ("error" in fields) return fields;

  const { error } = await db
    .from("student_profiles")
    .update(fields)
    .eq("student_id", studentId)
    .eq("firm_id", ctx.firmId);
  if (error) {
    console.error("Failed to update profile:", error);
    return { error: "Failed to update profile" };
  }

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

/**
 * Student intake: testing, preferences, and activity/award records for their
 * own profile. Family financials stay with the parents/counselor.
 */
export async function submitStudentIntake(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "student") return { error: "Not authorized" };

  const db = getDb();
  const { data: student } = await db
    .from("students")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .limit(1)
    .maybeSingle();
  if (!student) return { error: "No student record linked to your account" };

  const fields = extractProfileFields(formData, [
    "testing",
    "preferences",
    "records",
  ]);
  if ("error" in fields) return fields;

  const { error } = await db
    .from("student_profiles")
    .update({
      ...fields,
      intake_submitted_at: new Date().toISOString(),
      intake_submitted_by_user_id: ctx.dbUserId,
    })
    .eq("student_id", student.id)
    .eq("firm_id", ctx.firmId);
  if (error) {
    console.error("Failed to submit intake:", error);
    return { error: "Failed to save your profile" };
  }

  revalidatePath("/student-profile");
  return { success: true };
}

/**
 * Parent intake: family financials and citizenship for one of their
 * children. Testing and activity records belong to the student.
 */
export async function submitParentIntake(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "parent_guardian") return { error: "Not authorized" };

  const studentId = (formData.get("student_id") as string) || "";
  const db = getDb();
  const relationship = await resolveStudentRelationship(db, ctx, studentId);
  if (relationship !== "family_parent") {
    return { error: "Student not found" };
  }

  const fields = extractProfileFields(formData, ["financial"]);
  if ("error" in fields) return fields;

  const { error } = await db
    .from("student_profiles")
    .update({
      ...fields,
      intake_submitted_at: new Date().toISOString(),
      intake_submitted_by_user_id: ctx.dbUserId,
    })
    .eq("student_id", studentId)
    .eq("firm_id", ctx.firmId);
  if (error) {
    console.error("Failed to submit family intake:", error);
    return { error: "Failed to save family information" };
  }

  revalidatePath("/family-dashboard");
  return { success: true };
}

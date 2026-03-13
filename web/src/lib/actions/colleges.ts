"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  searchScorecard,
  getScorecardById,
  scorecardToColumns,
} from "../scorecard/client";
import { inngest } from "../queue/inngest";

// ---- Student college list management ----

export async function addStudentCollege(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const studentId = formData.get("student_id") as string;
  const collegeId = formData.get("college_id") as string;
  const category = (formData.get("category") as string) || "target";
  const roundType = (formData.get("round_type") as string) || null;
  const intendedMajor = (formData.get("intended_major") as string) || null;

  if (!studentId || !collegeId) {
    return { error: "Student and college are required" };
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("student_colleges")
    .insert({
      firm_id: ctx.firmId,
      student_id: studentId,
      college_id: collegeId,
      category,
      round_type: roundType,
      intended_major: intendedMajor,
      status: "researching",
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "This college is already on the student's list" };
    }
    console.error("Failed to add student college:", error);
    return { error: "Failed to add college to list" };
  }

  revalidatePath("/college-planning");
  revalidatePath("/applications");
  return { id: data.id };
}

export async function updateStudentCollege(
  studentCollegeId: string,
  formData: FormData
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = {
    updated_by_user_id: ctx.dbUserId,
    updated_at: new Date().toISOString(),
  };

  const fields = [
    "category",
    "round_type",
    "intended_major",
    "interest_level",
    "counselor_fit_rating",
    "status",
    "notes",
  ];

  for (const field of fields) {
    const value = formData.get(field);
    if (value !== null) {
      updates[field] =
        field === "interest_level" || field === "counselor_fit_rating"
          ? parseInt(value as string) || null
          : value || null;
    }
  }

  const db = createServerClient();
  const { error } = await db
    .from("student_colleges")
    .update(updates)
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update student college:", error);
    return { error: "Failed to update college list entry" };
  }

  revalidatePath("/college-planning");
  return { success: true };
}

export async function removeStudentCollege(studentCollegeId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();
  const { error } = await db
    .from("student_colleges")
    .delete()
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to remove college from list" };

  revalidatePath("/college-planning");
  return { success: true };
}

export async function reorderStudentColleges(orderedIds: string[]) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();

  const updates = orderedIds.map((id, index) =>
    db
      .from("student_colleges")
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("firm_id", ctx.firmId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("Failed to reorder:", failed.error);
    return { error: "Failed to reorder list" };
  }

  revalidatePath("/college-planning");
  return { success: true };
}

// ---- Scorecard data sync ----

export async function syncCollegeScorecard(collegeId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();

  const { data: college } = await db
    .from("colleges")
    .select("name, scorecard_id")
    .eq("id", collegeId)
    .single();

  if (!college) return { error: "College not found" };

  let result;
  try {
    if (college.scorecard_id) {
      // Deterministic lookup by IPEDS ID
      result = await getScorecardById(college.scorecard_id);
    } else {
      // Fallback: search by name, take first match
      const results = await searchScorecard(college.name);
      result = results[0] ?? null;
    }
  } catch (e) {
    console.error("Scorecard API error:", e);
    return { error: "Failed to connect to College Scorecard API" };
  }

  if (!result) {
    return { error: "No match found in College Scorecard" };
  }

  const columns = scorecardToColumns(result);

  const { error } = await db
    .from("colleges")
    .update(columns)
    .eq("id", collegeId);

  if (error) {
    console.error("Failed to save scorecard data:", error);
    return { error: "Failed to save scorecard data" };
  }

  revalidatePath("/college-planning");
  revalidatePath(`/college-planning/${collegeId}`);
  return { success: true, scorecardId: result.id };
}

// ---- College research notes ----

export async function addCollegeResearchNote(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const studentCollegeId = formData.get("student_college_id") as string;
  const title = (formData.get("title") as string)?.trim() || null;
  const body = (formData.get("body") as string)?.trim();

  if (!studentCollegeId || !body) {
    return { error: "Student-college and note body are required" };
  }

  const db = createServerClient();

  // Verify the student_college belongs to this firm
  const { data: sc } = await db
    .from("student_colleges")
    .select("id, student_id, college_id")
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!sc) return { error: "College list entry not found" };

  const { error } = await db.from("notes").insert({
    firm_id: ctx.firmId,
    student_id: sc.student_id,
    student_college_id: studentCollegeId,
    note_type: "college_research",
    title,
    body,
    visibility_scope: "staff",
    created_by_user_id: ctx.dbUserId,
    updated_by_user_id: ctx.dbUserId,
  });

  if (error) {
    console.error("Failed to add research note:", error);
    return { error: "Failed to add note" };
  }

  revalidatePath(`/college-planning/${sc.college_id}`);
  return { success: true };
}

// ---- Bulk scorecard sync ----

export async function startBulkScorecardSync(mode: "unsynced" | "stale" | "all") {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  await inngest.send({
    name: "colleges/bulk-sync-scorecard",
    data: { mode },
  });

  return { success: true };
}

export async function getBulkSyncStatus() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();

  // Get the latest sync audit event
  const { data } = await db
    .from("audit_events")
    .select("action, metadata, created_at")
    .eq("entity_type", "scorecard_sync")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    action: data.action as string,
    metadata: data.metadata as Record<string, unknown>,
    created_at: data.created_at as string,
  };
}

export async function getUnsyncedCollegeCount() {
  const db = createServerClient();

  const [unsyncedResult, totalResult, staleResult] = await Promise.all([
    db
      .from("colleges")
      .select("id", { count: "exact", head: true })
      .is("scorecard_synced_at", null),
    db
      .from("colleges")
      .select("id", { count: "exact", head: true }),
    db
      .from("colleges")
      .select("id", { count: "exact", head: true })
      .lt(
        "scorecard_synced_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      ),
  ]);

  return {
    unsynced: unsyncedResult.count ?? 0,
    total: totalResult.count ?? 0,
    stale: staleResult.count ?? 0,
  };
}

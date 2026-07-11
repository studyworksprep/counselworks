"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";

export async function createStudent(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;
  const graduationYear = parseInt(formData.get("graduation_year") as string);
  const familyId = formData.get("family_id") as string;
  const schoolName = (formData.get("school_name") as string) || null;
  const email = (formData.get("email") as string) || null;

  if (!firstName || !lastName || !graduationYear || !familyId) {
    return { error: "First name, last name, graduation year, and family are required" };
  }

  const db = getDb();
  const { data, error } = await db
    .from("students")
    .insert({
      firm_id: ctx.firmId,
      family_id: familyId,
      first_name: firstName,
      last_name: lastName,
      graduation_year: graduationYear,
      school_name: schoolName,
      status: "active",
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create student:", error);
    return { error: "Failed to create student" };
  }

  // Create empty profile
  await db.from("student_profiles").insert({
    firm_id: ctx.firmId,
    student_id: data.id,
  });

  // If email provided, create a user record and link
  if (email) {
    const { data: existingUser } = await db
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      await db
        .from("students")
        .update({ user_id: existingUser.id })
        .eq("id", data.id);
    }
  }

  revalidatePath("/students");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateStudent(studentId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = {
    updated_by_user_id: ctx.dbUserId,
  };

  const fields = [
    "first_name",
    "last_name",
    "graduation_year",
    "school_name",
    "school_type",
    "status",
    "preferred_name",
    "academic_interests",
    "extracurricular_summary",
  ];

  for (const field of fields) {
    const value = formData.get(field);
    if (value !== null) {
      updates[field] =
        field === "graduation_year" ? parseInt(value as string) : value;
    }
  }

  const db = getDb();
  const { error } = await db
    .from("students")
    .update(updates)
    .eq("id", studentId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update student:", error);
    return { error: "Failed to update student" };
  }

  // Update profile fields if present
  const profileFields = [
    "gpa_unweighted",
    "gpa_weighted",
    "class_rank",
    "citizenship_status",
    "budget_range",
    "financial_aid_interest",
  ];

  const profileUpdates: Record<string, unknown> = {};
  let hasProfileUpdate = false;

  for (const field of profileFields) {
    const value = formData.get(field);
    if (value !== null) {
      profileUpdates[field] = value;
      hasProfileUpdate = true;
    }
  }

  if (hasProfileUpdate) {
    // Also move GPA fields from student to profile
    const gpaUW = formData.get("gpa_unweighted");
    const gpaW = formData.get("gpa_weighted");
    const classRank = formData.get("class_rank");

    if (gpaUW !== null || gpaW !== null || classRank !== null) {
      const studentUpdates: Record<string, unknown> = {
        updated_by_user_id: ctx.dbUserId,
      };
      if (gpaUW !== null)
        studentUpdates.gpa_unweighted = parseFloat(gpaUW as string) || null;
      if (gpaW !== null)
        studentUpdates.gpa_weighted = parseFloat(gpaW as string) || null;
      if (classRank !== null) studentUpdates.class_rank = classRank;

      await db
        .from("students")
        .update(studentUpdates)
        .eq("id", studentId)
        .eq("firm_id", ctx.firmId);
    }

    await db
      .from("student_profiles")
      .update(profileUpdates)
      .eq("student_id", studentId)
      .eq("firm_id", ctx.firmId);
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function archiveStudent(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  const { error } = await db
    .from("students")
    .update({
      archived_at: new Date().toISOString(),
      status: "archived",
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", studentId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to archive student" };

  revalidatePath("/students");
  revalidatePath("/dashboard");
  return { success: true };
}

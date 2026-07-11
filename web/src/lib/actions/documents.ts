"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, isStaffRole } from "../auth/resolve";
import {
  AuthorizationError,
  requireDocumentAccess,
  requireStaff,
  resolveStudentRelationship,
} from "../auth/authorize";
import {
  uploadFile,
  getSignedUrl,
  deleteFile,
  getStoragePath,
  BUCKET_DOCUMENTS,
} from "../storage";
import { inngest } from "../queue/inngest";

export async function uploadDocument(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string) || file?.name || "Untitled";
  const category = (formData.get("category") as string) || "other";
  let studentId = (formData.get("student_id") as string) || null;
  let visibility = (formData.get("visibility_scope") as string) || "staff";

  if (!file || file.size === 0) {
    return { error: "File is required" };
  }

  const db = getDb();

  const staffActor = isStaffRole(ctx.role);
  if (!staffActor) {
    // Portal uploads are pinned to the uploader's own student and are always
    // family-visible (deliberate default: a transcript a parent submits is
    // for the whole client team — student, family, and staff — to see).
    visibility = "family";
    if (ctx.role === "student") {
      const { data: own } = await db
        .from("students")
        .select("id")
        .eq("firm_id", ctx.firmId)
        .eq("user_id", ctx.dbUserId)
        .limit(1)
        .maybeSingle();
      if (!own) return { error: "No student record linked to your account" };
      studentId = own.id;
    } else if (ctx.role === "parent_guardian") {
      const relationship = studentId
        ? await resolveStudentRelationship(db, ctx, studentId)
        : "none";
      if (relationship !== "family_parent") {
        return { error: "Select which student this document is for" };
      }
    } else {
      return { error: "Not authorized" };
    }
  }

  // Generate storage path
  const entityType = studentId ? "students" : "firm";
  const entityId = studentId ?? ctx.firmId;
  const storageKey = getStoragePath(
    ctx.firmId,
    entityType,
    entityId,
    `${Date.now()}-${file.name}`
  );

  // Upload to storage
  try {
    await uploadFile(BUCKET_DOCUMENTS, storageKey, file);
  } catch (e) {
    console.error("Storage upload failed:", e);
    return { error: "Failed to upload file" };
  }

  // Create document record
  const { data, error } = await db
    .from("documents")
    .insert({
      firm_id: ctx.firmId,
      title,
      category,
      storage_key: storageKey,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      visibility_scope: visibility,
      student_id: studentId,
      uploaded_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create document record:", error);
    // Try to clean up the uploaded file
    try {
      await deleteFile(BUCKET_DOCUMENTS, storageKey);
    } catch {}
    return { error: "Failed to save document" };
  }

  // Dispatch background document processing job
  await inngest.send({
    name: "document/process",
    data: {
      documentId: data.id,
      firmId: ctx.firmId,
      uploadedByUserId: ctx.dbUserId,
    },
  });

  revalidatePath("/documents");
  revalidatePath("/student-documents");
  revalidatePath("/family-documents");
  return { id: data.id };
}

export async function getDocumentDownloadUrl(documentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();

  // Tenancy + role + visibility_scope. Fetch-by-UUID must never grant more
  // than the list queries do.
  let doc;
  try {
    doc = await requireDocumentAccess(db, ctx, documentId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Document not found" };
    throw e;
  }

  try {
    const url = await getSignedUrl(BUCKET_DOCUMENTS, doc.storage_key, 300);
    await db.from("document_access_logs").insert({
      firm_id: ctx.firmId,
      document_id: doc.id,
      user_id: ctx.dbUserId,
      action_type: "downloaded",
    });
    return { url };
  } catch {
    return { error: "Failed to generate download link" };
  }
}

export async function archiveDocument(documentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const { error } = await db
    .from("documents")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to delete document" };

  revalidatePath("/documents");
  return { success: true };
}

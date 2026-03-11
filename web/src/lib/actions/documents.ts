"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  uploadFile,
  getSignedUrl,
  deleteFile,
  getStoragePath,
  BUCKET_DOCUMENTS,
} from "../storage";

export async function uploadDocument(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string) || file?.name || "Untitled";
  const category = (formData.get("category") as string) || "other";
  const studentId = (formData.get("student_id") as string) || null;
  const visibility = (formData.get("visibility_scope") as string) || "staff";

  if (!file || file.size === 0) {
    return { error: "File is required" };
  }

  const db = createServerClient();

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

  revalidatePath("/documents");
  return { id: data.id };
}

export async function getDocumentDownloadUrl(documentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();
  const { data: doc } = await db
    .from("documents")
    .select("storage_key")
    .eq("id", documentId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!doc) return { error: "Document not found" };

  try {
    const url = await getSignedUrl(BUCKET_DOCUMENTS, doc.storage_key, 300);
    return { url };
  } catch {
    return { error: "Failed to generate download link" };
  }
}

export async function archiveDocument(documentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();
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

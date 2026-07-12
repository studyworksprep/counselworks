"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, isStaffRole,
  isPlaceholderUser,
} from "../auth/resolve";
import { recordAuditEvent } from "../audit";
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
import { getDocumentVersions } from "../db/queries";

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

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "document",
    entityId: data.id,
    actionType: "document_uploaded",
    label: `Document uploaded: ${title}`,
  });

  // Fulfil an open document request when the upload answers one (10.5).
  const requestId = (formData.get("request_id") as string) || null;
  if (requestId) {
    const { data: fulfilled } = await db
      .from("document_requests")
      .update({
        status: "fulfilled",
        fulfilled_document_id: data.id,
        fulfilled_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("firm_id", ctx.firmId)
      .eq("status", "requested")
      .select("title, requested_by_user_id")
      .maybeSingle();
    if (fulfilled) {
      await db.from("notifications").insert({
        firm_id: ctx.firmId,
        user_id: fulfilled.requested_by_user_id,
        kind: "document_request_fulfilled",
        title: `Request fulfilled: ${fulfilled.title}`,
        body: `"${title}" was uploaded.`,
        href: "/documents",
      });
    }
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

// ---------------------------------------------------------------------------
// Document requests (fix plan 10.5): request → portal prompt → fulfillment
// ---------------------------------------------------------------------------

export async function requestDocument(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as string) || "other";
  const studentId = (formData.get("student_id") as string) || null;
  const note = (formData.get("note") as string) || null;
  const dueAt = (formData.get("due_at") as string) || null;
  if (!title) return { error: "Title is required" };
  if (!studentId) return { error: "Choose a student" };

  const db = getDb();
  const { data: student } = await db
    .from("students")
    .select("id, family_id, first_name, user_id")
    .eq("id", studentId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!student) return { error: "Student not found" };

  const { data: request, error } = await db
    .from("document_requests")
    .insert({
      firm_id: ctx.firmId,
      student_id: studentId,
      family_id: student.family_id,
      title,
      category,
      note,
      due_at: dueAt,
      requested_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();
  if (error || !request) return { error: "Failed to create request" };

  // Prompt every claimed portal account in the household via the in-app
  // feed; the portal documents pages surface open requests prominently.
  const { data: members } = await db
    .from("family_members")
    .select("users:user_id(id, auth_provider_user_id)")
    .eq("firm_id", ctx.firmId)
    .eq("family_id", student.family_id);
  const recipientIds = [
    ...(members ?? [])
      .map(
        (m) =>
          (Array.isArray(m.users) ? m.users[0] : m.users) as {
            id: string;
            auth_provider_user_id: string;
          } | null
      )
      .filter(
        (u): u is NonNullable<typeof u> =>
          !!u && !isPlaceholderUser(u.auth_provider_user_id)
      )
      .map((u) => u.id),
  ];
  if (student.user_id) recipientIds.push(student.user_id);
  for (const userId of new Set(recipientIds)) {
    await db.from("notifications").insert({
      firm_id: ctx.firmId,
      user_id: userId,
      kind: "document_request",
      title: `Document requested: ${title}`,
      body: note,
      href: "/family-documents",
    });
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "document_request",
    entityId: request.id,
    actionType: "document_requested",
    label: `Document requested: ${title}`,
  });

  revalidatePath("/documents");
  revalidatePath("/family-documents");
  revalidatePath("/student-documents");
  return { id: request.id };
}

export async function cancelDocumentRequest(requestId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }
  const db = getDb();
  const { error } = await db
    .from("document_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("firm_id", ctx.firmId)
    .eq("status", "requested");
  if (error) return { error: "Failed to cancel request" };
  revalidatePath("/documents");
  revalidatePath("/family-documents");
  revalidatePath("/student-documents");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Re-upload versioning (fix plan 10.5): document_versions gets its writer
// ---------------------------------------------------------------------------

/** Version history, gated by the same check the download endpoint uses. */
export async function listDocumentVersions(documentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };
  const db = getDb();
  try {
    await requireDocumentAccess(db, ctx, documentId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Document not found" as const };
    }
    throw e;
  }
  const versions = await getDocumentVersions(documentId);
  return { versions };
}

export async function uploadNewDocumentVersion(
  documentId: string,
  formData: FormData
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "File is required" };

  const db = getDb();
  const { data: doc } = await db
    .from("documents")
    .select("id, title, storage_key, student_id, uploaded_by_user_id")
    .eq("id", documentId)
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .maybeSingle();
  if (!doc) return { error: "Document not found" };

  // Staff, or the original uploader (portal users can re-submit their own).
  if (!isStaffRole(ctx.role) && doc.uploaded_by_user_id !== ctx.dbUserId) {
    return { error: "Not authorized" };
  }

  // Preserve the current file as a version snapshot, then swap the pointer.
  const { data: latest } = await db
    .from("document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version_number ?? 1) + 1;

  await db.from("document_versions").insert({
    document_id: documentId,
    version_number: nextVersion - 1,
    storage_key: doc.storage_key,
    uploaded_by_user_id: doc.uploaded_by_user_id,
  });

  const entityType = doc.student_id ? "students" : "firm";
  const entityId = doc.student_id ?? ctx.firmId;
  const storageKey = getStoragePath(
    ctx.firmId,
    entityType,
    entityId,
    `${Date.now()}-${file.name}`
  );
  try {
    await uploadFile(BUCKET_DOCUMENTS, storageKey, file);
  } catch (e) {
    console.error("Version upload failed:", e);
    return { error: "Failed to upload file" };
  }

  const { error } = await db
    .from("documents")
    .update({
      storage_key: storageKey,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update document" };

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "document",
    entityId: documentId,
    actionType: "document_version_uploaded",
    label: `New version uploaded: ${doc.title} (v${nextVersion})`,
  });

  revalidatePath("/documents");
  revalidatePath("/family-documents");
  revalidatePath("/student-documents");
  return { success: true, version: nextVersion };
}

import { createServerClient } from "@/lib/db/client";

const BUCKET_DOCUMENTS = "documents";
const BUCKET_ESSAYS = "essays";
const BUCKET_UPLOADS = "uploads";

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob
) {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });

  if (error) throw error;
  return data;
}

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
) {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(bucket: string, path: string) {
  const supabase = createServerClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export function getStoragePath(
  firmId: string,
  entityType: string,
  entityId: string,
  fileName: string
) {
  return `${firmId}/${entityType}/${entityId}/${fileName}`;
}

export { BUCKET_DOCUMENTS, BUCKET_ESSAYS, BUCKET_UPLOADS };

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Document,
  DocumentVersion,
  CreateDocumentInput,
  CreateDocumentVersionInput,
} from './types';

export async function getDocumentsByStudent(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: Document[]; error: Error | null }> {
  const { data, error } = await client
    .from('documents')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  return { data: (data as Document[]) ?? [], error };
}

export async function getDocumentsByFamily(
  client: SupabaseClient,
  familyId: string,
): Promise<{ data: Document[]; error: Error | null }> {
  // Documents are linked through students; find all students in the family first.
  const { data: students } = await client
    .from('students')
    .select('id')
    .eq('family_id', familyId);

  if (!students || students.length === 0) {
    return { data: [], error: null };
  }

  const studentIds = students.map((s) => s.id);

  const { data, error } = await client
    .from('documents')
    .select('*')
    .in('student_id', studentIds)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  return { data: (data as Document[]) ?? [], error };
}

export async function getDocumentById(
  client: SupabaseClient,
  documentId: string,
): Promise<{ data: Document | null; error: Error | null }> {
  const { data, error } = await client
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  return { data: data as Document | null, error };
}

export async function createDocument(
  client: SupabaseClient,
  input: CreateDocumentInput,
): Promise<{ data: Document | null; error: Error | null }> {
  const { data, error } = await client
    .from('documents')
    .insert({
      ...input,
      visibility: input.visibility ?? 'counselors_only',
    })
    .select('*')
    .single();

  return { data: data as Document | null, error };
}

export async function createDocumentVersion(
  client: SupabaseClient,
  input: CreateDocumentVersionInput,
): Promise<{ data: DocumentVersion | null; error: Error | null }> {
  // Determine the next version number
  const { data: existing } = await client
    .from('document_versions')
    .select('version_number')
    .eq('document_id', input.document_id)
    .order('version_number', { ascending: false })
    .limit(1);

  const nextVersion =
    existing && existing.length > 0
      ? (existing[0].version_number as number) + 1
      : 1;

  const { data, error } = await client
    .from('document_versions')
    .insert({
      ...input,
      version_number: nextVersion,
    })
    .select('*')
    .single();

  if (data) {
    // Update the parent document to reflect the latest version
    await client
      .from('documents')
      .update({
        file_name: input.file_name,
        file_url: input.file_url,
        file_size_bytes: input.file_size_bytes,
        mime_type: input.mime_type,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.document_id);
  }

  return { data: data as DocumentVersion | null, error };
}

export async function archiveDocument(
  client: SupabaseClient,
  documentId: string,
): Promise<{ data: Document | null; error: Error | null }> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('documents')
    .update({ is_archived: true, archived_at: now, updated_at: now })
    .eq('id', documentId)
    .select('*')
    .single();

  return { data: data as Document | null, error };
}

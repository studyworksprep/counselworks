import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Note,
  NoteWithAuthor,
  CreateNoteInput,
  UpdateNoteInput,
} from './types';

export async function getNotesByStudent(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: NoteWithAuthor[]; error: Error | null }> {
  const { data, error } = await client
    .from('notes')
    .select('*, author:users!notes_author_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  return { data: (data as NoteWithAuthor[]) ?? [], error };
}

export async function getNotesByFamily(
  client: SupabaseClient,
  familyId: string,
): Promise<{ data: NoteWithAuthor[]; error: Error | null }> {
  const { data, error } = await client
    .from('notes')
    .select('*, author:users!notes_author_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  return { data: (data as NoteWithAuthor[]) ?? [], error };
}

export async function getNoteById(
  client: SupabaseClient,
  noteId: string,
): Promise<{ data: NoteWithAuthor | null; error: Error | null }> {
  const { data, error } = await client
    .from('notes')
    .select('*, author:users!notes_author_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('id', noteId)
    .single();

  return { data: data as NoteWithAuthor | null, error };
}

export async function createNote(
  client: SupabaseClient,
  input: CreateNoteInput,
): Promise<{ data: Note | null; error: Error | null }> {
  const { data, error } = await client
    .from('notes')
    .insert({
      ...input,
      is_private: input.is_private ?? false,
      status: 'active',
    })
    .select('*')
    .single();

  return { data: data as Note | null, error };
}

export async function updateNote(
  client: SupabaseClient,
  noteId: string,
  input: UpdateNoteInput,
): Promise<{ data: Note | null; error: Error | null }> {
  const { data, error } = await client
    .from('notes')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('*')
    .single();

  return { data: data as Note | null, error };
}

export async function archiveNote(
  client: SupabaseClient,
  noteId: string,
): Promise<{ data: Note | null; error: Error | null }> {
  const { data, error } = await client
    .from('notes')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('*')
    .single();

  return { data: data as Note | null, error };
}

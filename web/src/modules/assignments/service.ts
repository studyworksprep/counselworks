import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Assignment,
  AssignmentWithCounselor,
  AssignmentWithStudent,
  CreateAssignmentInput,
} from './types';

export async function getAssignmentsByStudent(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: AssignmentWithCounselor[]; error: Error | null }> {
  const { data, error } = await client
    .from('assignments')
    .select('*, users(id, first_name, last_name, email, avatar_url)')
    .eq('student_id', studentId)
    .order('is_primary', { ascending: false })
    .order('assigned_at', { ascending: true });

  return { data: (data as AssignmentWithCounselor[]) ?? [], error };
}

export async function getStudentsByCounselor(
  client: SupabaseClient,
  counselorId: string,
  firmId: string,
): Promise<{ data: AssignmentWithStudent[]; error: Error | null }> {
  const { data, error } = await client
    .from('assignments')
    .select('*, students(id, first_name, last_name, email, graduation_year, status)')
    .eq('counselor_id', counselorId)
    .eq('firm_id', firmId)
    .order('assigned_at', { ascending: true });

  return { data: (data as AssignmentWithStudent[]) ?? [], error };
}

export async function createAssignment(
  client: SupabaseClient,
  input: CreateAssignmentInput,
): Promise<{ data: Assignment | null; error: Error | null }> {
  const { data, error } = await client
    .from('assignments')
    .insert({
      ...input,
      is_primary: input.is_primary ?? false,
      assigned_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  return { data: data as Assignment | null, error };
}

export async function removeAssignment(
  client: SupabaseClient,
  assignmentId: string,
): Promise<{ data: null; error: Error | null }> {
  const { error } = await client
    .from('assignments')
    .delete()
    .eq('id', assignmentId);

  return { data: null, error };
}

export async function getPrimaryCounselor(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: AssignmentWithCounselor | null; error: Error | null }> {
  const { data, error } = await client
    .from('assignments')
    .select('*, users(id, first_name, last_name, email, avatar_url)')
    .eq('student_id', studentId)
    .eq('is_primary', true)
    .single();

  return { data: data as AssignmentWithCounselor | null, error };
}

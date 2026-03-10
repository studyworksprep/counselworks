import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Student,
  StudentProfile,
  StudentWithProfile,
  StudentFilters,
  CreateStudentInput,
  UpdateStudentInput,
  UpsertStudentProfileInput,
} from './types';

export async function getStudentsByFirm(
  client: SupabaseClient,
  firmId: string,
  filters?: StudentFilters,
): Promise<{ data: Student[]; error: Error | null }> {
  let query = client
    .from('students')
    .select('*')
    .eq('firm_id', firmId);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.graduation_year) {
    query = query.eq('graduation_year', filters.graduation_year);
  }

  if (filters?.family_id) {
    query = query.eq('family_id', filters.family_id);
  }

  if (filters?.counselor_id) {
    // Filter by counselor through the assignments table using a subquery
    const { data: assignmentData } = await client
      .from('assignments')
      .select('student_id')
      .eq('counselor_id', filters.counselor_id)
      .eq('firm_id', firmId);

    const studentIds = assignmentData?.map((a) => a.student_id) ?? [];
    if (studentIds.length === 0) {
      return { data: [], error: null };
    }
    query = query.in('id', studentIds);
  }

  const { data, error } = await query.order('last_name', { ascending: true });

  return { data: (data as Student[]) ?? [], error };
}

export async function getStudentById(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: Student | null; error: Error | null }> {
  const { data, error } = await client
    .from('students')
    .select('*')
    .eq('id', studentId)
    .single();

  return { data: data as Student | null, error };
}

export async function getStudentWithProfile(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: StudentWithProfile | null; error: Error | null }> {
  const { data, error } = await client
    .from('students')
    .select('*, student_profiles(*)')
    .eq('id', studentId)
    .single();

  return { data: data as StudentWithProfile | null, error };
}

export async function createStudent(
  client: SupabaseClient,
  input: CreateStudentInput,
): Promise<{ data: Student | null; error: Error | null }> {
  const { data, error } = await client
    .from('students')
    .insert(input)
    .select('*')
    .single();

  return { data: data as Student | null, error };
}

export async function updateStudent(
  client: SupabaseClient,
  studentId: string,
  input: UpdateStudentInput,
): Promise<{ data: Student | null; error: Error | null }> {
  const { data, error } = await client
    .from('students')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', studentId)
    .select('*')
    .single();

  return { data: data as Student | null, error };
}

export async function archiveStudent(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: Student | null; error: Error | null }> {
  const { data, error } = await client
    .from('students')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', studentId)
    .select('*')
    .single();

  return { data: data as Student | null, error };
}

export async function getStudentProfile(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: StudentProfile | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_profiles')
    .select('*')
    .eq('student_id', studentId)
    .single();

  return { data: data as StudentProfile | null, error };
}

export async function upsertStudentProfile(
  client: SupabaseClient,
  input: UpsertStudentProfileInput,
): Promise<{ data: StudentProfile | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_profiles')
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: 'student_id' },
    )
    .select('*')
    .single();

  return { data: data as StudentProfile | null, error };
}

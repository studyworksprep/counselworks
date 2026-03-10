import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  College,
  StudentCollege,
  StudentCollegeWithCollege,
  CreateCollegeInput,
  UpdateCollegeInput,
  CreateStudentCollegeInput,
  UpdateStudentCollegeInput,
} from './types';

export async function searchColleges(
  client: SupabaseClient,
  query: string,
  limit = 20,
): Promise<{ data: College[]; error: Error | null }> {
  const { data, error } = await client
    .from('colleges')
    .select('*')
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(limit);

  return { data: (data as College[]) ?? [], error };
}

export async function getCollegeById(
  client: SupabaseClient,
  collegeId: string,
): Promise<{ data: College | null; error: Error | null }> {
  const { data, error } = await client
    .from('colleges')
    .select('*')
    .eq('id', collegeId)
    .single();

  return { data: data as College | null, error };
}

export async function getCollegeBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<{ data: College | null; error: Error | null }> {
  const { data, error } = await client
    .from('colleges')
    .select('*')
    .eq('slug', slug)
    .single();

  return { data: data as College | null, error };
}

export async function createCollege(
  client: SupabaseClient,
  input: CreateCollegeInput,
): Promise<{ data: College | null; error: Error | null }> {
  const { data, error } = await client
    .from('colleges')
    .insert(input)
    .select('*')
    .single();

  return { data: data as College | null, error };
}

export async function updateCollege(
  client: SupabaseClient,
  collegeId: string,
  input: UpdateCollegeInput,
): Promise<{ data: College | null; error: Error | null }> {
  const { data, error } = await client
    .from('colleges')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', collegeId)
    .select('*')
    .single();

  return { data: data as College | null, error };
}

export async function getStudentColleges(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: StudentCollegeWithCollege[]; error: Error | null }> {
  const { data, error } = await client
    .from('student_colleges')
    .select('*, colleges(*)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true });

  return { data: (data as StudentCollegeWithCollege[]) ?? [], error };
}

export async function addStudentCollege(
  client: SupabaseClient,
  input: CreateStudentCollegeInput,
): Promise<{ data: StudentCollege | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_colleges')
    .insert({
      ...input,
      list_type: input.list_type ?? 'undecided',
    })
    .select('*')
    .single();

  return { data: data as StudentCollege | null, error };
}

export async function updateStudentCollege(
  client: SupabaseClient,
  studentCollegeId: string,
  input: UpdateStudentCollegeInput,
): Promise<{ data: StudentCollege | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_colleges')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', studentCollegeId)
    .select('*')
    .single();

  return { data: data as StudentCollege | null, error };
}

export async function removeStudentCollege(
  client: SupabaseClient,
  studentCollegeId: string,
): Promise<{ data: null; error: Error | null }> {
  const { error } = await client
    .from('student_colleges')
    .delete()
    .eq('id', studentCollegeId);

  return { data: null, error };
}

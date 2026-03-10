import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Application,
  ApplicationWithCollege,
  ApplicationWithStudent,
  ApplicationFilters,
  CreateApplicationInput,
  UpdateApplicationInput,
} from './types';

export async function getApplicationsByStudent(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: ApplicationWithCollege[]; error: Error | null }> {
  const { data, error } = await client
    .from('applications')
    .select('*, colleges(id, name, slug, logo_url)')
    .eq('student_id', studentId)
    .order('deadline', { ascending: true });

  return { data: (data as ApplicationWithCollege[]) ?? [], error };
}

export async function getApplicationsByFirm(
  client: SupabaseClient,
  firmId: string,
  filters?: ApplicationFilters,
): Promise<{ data: ApplicationWithStudent[]; error: Error | null }> {
  let query = client
    .from('applications')
    .select('*, students(id, first_name, last_name), colleges(id, name, slug)')
    .eq('firm_id', firmId);

  if (filters?.student_id) {
    query = query.eq('student_id', filters.student_id);
  }

  if (filters?.college_id) {
    query = query.eq('college_id', filters.college_id);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.application_type) {
    query = query.eq('application_type', filters.application_type);
  }

  if (filters?.stage) {
    query = query.eq('stage', filters.stage);
  }

  const { data, error } = await query.order('deadline', { ascending: true });

  return { data: (data as ApplicationWithStudent[]) ?? [], error };
}

export async function getApplicationById(
  client: SupabaseClient,
  applicationId: string,
): Promise<{ data: ApplicationWithCollege | null; error: Error | null }> {
  const { data, error } = await client
    .from('applications')
    .select('*, colleges(id, name, slug, logo_url)')
    .eq('id', applicationId)
    .single();

  return { data: data as ApplicationWithCollege | null, error };
}

export async function createApplication(
  client: SupabaseClient,
  input: CreateApplicationInput,
): Promise<{ data: Application | null; error: Error | null }> {
  const { data, error } = await client
    .from('applications')
    .insert({
      ...input,
      stage: input.stage ?? 'not_started',
      status: 'in_progress',
    })
    .select('*')
    .single();

  return { data: data as Application | null, error };
}

export async function updateApplication(
  client: SupabaseClient,
  applicationId: string,
  input: UpdateApplicationInput,
): Promise<{ data: Application | null; error: Error | null }> {
  const { data, error } = await client
    .from('applications')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select('*')
    .single();

  return { data: data as Application | null, error };
}

export async function updateApplicationStage(
  client: SupabaseClient,
  applicationId: string,
  stage: string,
): Promise<{ data: Application | null; error: Error | null }> {
  const { data, error } = await client
    .from('applications')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select('*')
    .single();

  return { data: data as Application | null, error };
}

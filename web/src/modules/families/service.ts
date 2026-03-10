import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Family,
  FamilyMember,
  CreateFamilyInput,
  UpdateFamilyInput,
  CreateFamilyMemberInput,
} from './types';

export async function getFamiliesByFirm(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: Family[]; error: Error | null }> {
  const { data, error } = await client
    .from('families')
    .select('*')
    .eq('firm_id', firmId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  return { data: (data as Family[]) ?? [], error };
}

export async function getFamilyById(
  client: SupabaseClient,
  familyId: string,
): Promise<{ data: Family | null; error: Error | null }> {
  const { data, error } = await client
    .from('families')
    .select('*')
    .eq('id', familyId)
    .single();

  return { data: data as Family | null, error };
}

export async function createFamily(
  client: SupabaseClient,
  input: CreateFamilyInput,
): Promise<{ data: Family | null; error: Error | null }> {
  const { data, error } = await client
    .from('families')
    .insert(input)
    .select('*')
    .single();

  return { data: data as Family | null, error };
}

export async function updateFamily(
  client: SupabaseClient,
  familyId: string,
  input: UpdateFamilyInput,
): Promise<{ data: Family | null; error: Error | null }> {
  const { data, error } = await client
    .from('families')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', familyId)
    .select('*')
    .single();

  return { data: data as Family | null, error };
}

export async function archiveFamily(
  client: SupabaseClient,
  familyId: string,
): Promise<{ data: Family | null; error: Error | null }> {
  const { data, error } = await client
    .from('families')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', familyId)
    .select('*')
    .single();

  return { data: data as Family | null, error };
}

export async function getFamilyMembers(
  client: SupabaseClient,
  familyId: string,
): Promise<{ data: FamilyMember[]; error: Error | null }> {
  const { data, error } = await client
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .order('is_primary_contact', { ascending: false })
    .order('last_name', { ascending: true });

  return { data: (data as FamilyMember[]) ?? [], error };
}

export async function addFamilyMember(
  client: SupabaseClient,
  input: CreateFamilyMemberInput,
): Promise<{ data: FamilyMember | null; error: Error | null }> {
  const { data, error } = await client
    .from('family_members')
    .insert(input)
    .select('*')
    .single();

  return { data: data as FamilyMember | null, error };
}

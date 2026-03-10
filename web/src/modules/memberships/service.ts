import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Membership,
  MembershipWithUser,
  UserFirm,
  CreateMembershipInput,
  UpdateMembershipRoleInput,
  UpdateMembershipStatusInput,
} from './types';

export async function getMembershipsByFirm(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: MembershipWithUser[]; error: Error | null }> {
  const { data, error } = await client
    .from('memberships')
    .select('*, users(id, email, first_name, last_name, avatar_url)')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: true });

  return { data: (data as MembershipWithUser[]) ?? [], error };
}

export async function getMembershipByFirmAndUser(
  client: SupabaseClient,
  firmId: string,
  userId: string,
): Promise<{ data: Membership | null; error: Error | null }> {
  const { data, error } = await client
    .from('memberships')
    .select('*')
    .eq('firm_id', firmId)
    .eq('user_id', userId)
    .single();

  return { data: data as Membership | null, error };
}

export async function createMembership(
  client: SupabaseClient,
  input: CreateMembershipInput,
): Promise<{ data: Membership | null; error: Error | null }> {
  const { data, error } = await client
    .from('memberships')
    .insert({
      ...input,
      status: input.status ?? 'active',
      joined_at: input.status === 'invited' ? null : new Date().toISOString(),
      invited_at: input.status === 'invited' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  return { data: data as Membership | null, error };
}

export async function updateMembershipRole(
  client: SupabaseClient,
  membershipId: string,
  input: UpdateMembershipRoleInput,
): Promise<{ data: Membership | null; error: Error | null }> {
  const { data, error } = await client
    .from('memberships')
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq('id', membershipId)
    .select('*')
    .single();

  return { data: data as Membership | null, error };
}

export async function updateMembershipStatus(
  client: SupabaseClient,
  membershipId: string,
  input: UpdateMembershipStatusInput,
): Promise<{ data: Membership | null; error: Error | null }> {
  const payload: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };

  if (input.status === 'active') {
    payload.joined_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from('memberships')
    .update(payload)
    .eq('id', membershipId)
    .select('*')
    .single();

  return { data: data as Membership | null, error };
}

export async function getUserFirms(
  client: SupabaseClient,
  userId: string,
): Promise<{ data: UserFirm[]; error: Error | null }> {
  const { data, error } = await client
    .from('memberships')
    .select('*, firms(id, name, slug, logo_url)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  return { data: (data as UserFirm[]) ?? [], error };
}

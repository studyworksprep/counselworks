import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Membership,
  MembershipWithUser,
  UserFirm,
  CreateMembershipInput,
  UpdateMembershipRoleInput,
  UpdateMembershipStatusInput,
} from './types';

const TABLE = 'firm_memberships' as const;

export async function getMembershipsByFirm(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: MembershipWithUser[]; error: Error | null }> {
  const { data, error } = await client
    .from(TABLE)
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
    .from(TABLE)
    .select('*')
    .eq('firm_id', firmId)
    .eq('user_id', userId)
    .single();

  return { data: data as Membership | null, error };
}

export async function getActiveSeatCount(
  client: SupabaseClient,
  firmId: string,
): Promise<{ count: number; error: Error | null }> {
  const { count, error } = await client
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .in('status', ['active', 'invited']);

  return { count: count ?? 0, error };
}

export async function checkSeatAvailability(
  client: SupabaseClient,
  firmId: string,
): Promise<{ allowed: boolean; currentSeats: number; maxSeats: number | null; error: Error | null }> {
  // Get the firm's active subscription and plan limits
  const { data: sub, error: subError } = await client
    .from('firm_subscriptions')
    .select('*, subscription_plans(max_seats)')
    .eq('firm_id', firmId)
    .in('status', ['active', 'trialing'])
    .single();

  if (subError || !sub) {
    // No active subscription — fall back to free plan limits
    const { count } = await getActiveSeatCount(client, firmId);
    return { allowed: count < 2, currentSeats: count, maxSeats: 2, error: subError };
  }

  const maxSeats = (sub as Record<string, unknown> & { subscription_plans: { max_seats: number | null } })
    .subscription_plans?.max_seats;

  // NULL max_seats = unlimited (internal plan)
  if (maxSeats === null || maxSeats === undefined) {
    const { count } = await getActiveSeatCount(client, firmId);
    return { allowed: true, currentSeats: count, maxSeats: null, error: null };
  }

  const { count } = await getActiveSeatCount(client, firmId);
  return { allowed: count < maxSeats, currentSeats: count, maxSeats, error: null };
}

export async function createMembership(
  client: SupabaseClient,
  input: CreateMembershipInput,
  options?: { skipSeatCheck?: boolean },
): Promise<{ data: Membership | null; error: Error | null }> {
  // Enforce seat limits unless explicitly skipped
  if (!options?.skipSeatCheck) {
    const { allowed, currentSeats, maxSeats, error: seatError } = await checkSeatAvailability(client, input.firm_id);
    if (seatError) {
      return { data: null, error: seatError };
    }
    if (!allowed) {
      return {
        data: null,
        error: new Error(`Seat limit reached (${currentSeats}/${maxSeats}). Upgrade your plan to add more members.`),
      };
    }
  }

  const { data, error } = await client
    .from(TABLE)
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
    .from(TABLE)
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
    .from(TABLE)
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
    .from(TABLE)
    .select('*, firms(id, name, slug, logo_url)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  return { data: (data as UserFirm[]) ?? [], error };
}

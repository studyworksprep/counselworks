import type { SupabaseClient } from '@supabase/supabase-js';
import type { User, CreateUserInput, UpdateUserInput } from './types';

export async function getUserById(
  client: SupabaseClient,
  userId: string,
): Promise<{ data: User | null; error: Error | null }> {
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  return { data: data as User | null, error };
}

export async function getUserByAuthProviderId(
  client: SupabaseClient,
  authProviderId: string,
): Promise<{ data: User | null; error: Error | null }> {
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('auth_provider_id', authProviderId)
    .single();

  return { data: data as User | null, error };
}

export async function getUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<{ data: User | null; error: Error | null }> {
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  return { data: data as User | null, error };
}

export async function createUser(
  client: SupabaseClient,
  input: CreateUserInput,
): Promise<{ data: User | null; error: Error | null }> {
  const { data, error } = await client
    .from('users')
    .insert({ ...input, email: input.email.toLowerCase() })
    .select('*')
    .single();

  return { data: data as User | null, error };
}

export async function updateUser(
  client: SupabaseClient,
  userId: string,
  input: UpdateUserInput,
): Promise<{ data: User | null; error: Error | null }> {
  const payload: Record<string, unknown> = {
    ...input,
    updated_at: new Date().toISOString(),
  };
  if (input.email) {
    payload.email = input.email.toLowerCase();
  }

  const { data, error } = await client
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .single();

  return { data: data as User | null, error };
}

export async function updateLastLogin(
  client: SupabaseClient,
  userId: string,
): Promise<{ data: User | null; error: Error | null }> {
  const { data, error } = await client
    .from('users')
    .update({
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();

  return { data: data as User | null, error };
}

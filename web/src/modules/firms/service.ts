import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Firm,
  FirmSettings,
  CreateFirmInput,
  UpdateFirmInput,
  UpdateFirmSettingsInput,
} from './types';

export async function getFirmById(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: Firm | null; error: Error | null }> {
  const { data, error } = await client
    .from('firms')
    .select('*')
    .eq('id', firmId)
    .single();

  return { data: data as Firm | null, error };
}

export async function getFirmBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<{ data: Firm | null; error: Error | null }> {
  const { data, error } = await client
    .from('firms')
    .select('*')
    .eq('slug', slug)
    .single();

  return { data: data as Firm | null, error };
}

export async function createFirm(
  client: SupabaseClient,
  input: CreateFirmInput,
): Promise<{ data: Firm | null; error: Error | null }> {
  const { data, error } = await client
    .from('firms')
    .insert(input)
    .select('*')
    .single();

  return { data: data as Firm | null, error };
}

export async function updateFirm(
  client: SupabaseClient,
  firmId: string,
  input: UpdateFirmInput,
): Promise<{ data: Firm | null; error: Error | null }> {
  const { data, error } = await client
    .from('firms')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', firmId)
    .select('*')
    .single();

  return { data: data as Firm | null, error };
}

export async function getFirmSettings(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: FirmSettings | null; error: Error | null }> {
  const { data, error } = await client
    .from('firm_settings')
    .select('*')
    .eq('firm_id', firmId)
    .single();

  return { data: data as FirmSettings | null, error };
}

export async function updateFirmSettings(
  client: SupabaseClient,
  firmId: string,
  input: UpdateFirmSettingsInput,
): Promise<{ data: FirmSettings | null; error: Error | null }> {
  const { data, error } = await client
    .from('firm_settings')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('firm_id', firmId)
    .select('*')
    .single();

  return { data: data as FirmSettings | null, error };
}

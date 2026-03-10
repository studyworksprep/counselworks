import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditEvent,
  DocumentAccessLog,
  CreateAuditEventInput,
  AuditFilters,
} from './types';

export async function createAuditEvent(
  client: SupabaseClient,
  input: CreateAuditEventInput,
): Promise<{ data: AuditEvent | null; error: Error | null }> {
  const { data, error } = await client
    .from('audit_events')
    .insert(input)
    .select('*')
    .single();

  return { data: data as AuditEvent | null, error };
}

export async function getAuditEvents(
  client: SupabaseClient,
  firmId: string,
  filters?: AuditFilters,
  limit = 100,
  offset = 0,
): Promise<{ data: AuditEvent[]; error: Error | null }> {
  let query = client
    .from('audit_events')
    .select('*')
    .eq('firm_id', firmId);

  if (filters?.actor_id) {
    query = query.eq('user_id', filters.actor_id);
  }

  if (filters?.action) {
    query = query.eq('action', filters.action);
  }

  if (filters?.entity_type) {
    query = query.eq('resource_type', filters.entity_type);
  }

  if (filters?.entity_id) {
    query = query.eq('resource_id', filters.entity_id);
  }

  if (filters?.from_date) {
    query = query.gte('created_at', filters.from_date);
  }

  if (filters?.to_date) {
    query = query.lte('created_at', filters.to_date);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return { data: (data as AuditEvent[]) ?? [], error };
}

export async function logDocumentAccess(
  client: SupabaseClient,
  input: {
    firm_id: string;
    document_id: string;
    user_id: string;
    access_type: DocumentAccessLog['access_type'];
    ip_address?: string;
    user_agent?: string;
  },
): Promise<{ data: DocumentAccessLog | null; error: Error | null }> {
  const { data, error } = await client
    .from('document_access_logs')
    .insert(input)
    .select('*')
    .single();

  return { data: data as DocumentAccessLog | null, error };
}

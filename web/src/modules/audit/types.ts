export type AuditActionType =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'export'
  | 'import'
  | 'share'
  | 'permission_change'
  | 'status_change'
  | 'document_access'
  | 'document_download';

export interface AuditEvent {
  id: string;
  firm_id: string;
  user_id: string;
  action: AuditActionType;
  resource_type: string;
  resource_id: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface DocumentAccessLog {
  id: string;
  firm_id: string;
  document_id: string;
  user_id: string;
  access_type: 'view' | 'download' | 'print' | 'share';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type CreateAuditEventInput = Pick<AuditEvent, 'firm_id' | 'user_id' | 'action' | 'resource_type' | 'resource_id'> &
  Partial<Pick<AuditEvent, 'description' | 'metadata' | 'ip_address' | 'user_agent'>>;

export interface AuditFilters {
  actor_id?: string;
  action?: AuditActionType;
  entity_type?: string;
  entity_id?: string;
  from_date?: string;
  to_date?: string;
}

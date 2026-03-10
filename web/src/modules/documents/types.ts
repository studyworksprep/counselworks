import type { VisibilityScope } from '../families/types';

export type { VisibilityScope };

export type DocumentCategory =
  | 'transcript'
  | 'test_score'
  | 'recommendation_letter'
  | 'resume'
  | 'financial_document'
  | 'essay'
  | 'application_form'
  | 'correspondence'
  | 'contract'
  | 'other';

export interface Document {
  id: string;
  firm_id: string;
  student_id: string | null;
  uploaded_by: string;
  college_id: string | null;
  application_id: string | null;
  category: DocumentCategory;
  title: string;
  description: string | null;
  file_name: string;
  file_url: string;
  file_size_bytes: number;
  mime_type: string;
  visibility: VisibilityScope;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  file_url: string;
  file_size_bytes: number;
  mime_type: string;
  uploaded_by: string;
  change_note: string | null;
  created_at: string;
}

export interface DocumentWithVersions extends Document {
  document_versions: DocumentVersion[];
}

export type CreateDocumentInput = Pick<Document, 'firm_id' | 'uploaded_by' | 'category' | 'title' | 'file_name' | 'file_url' | 'file_size_bytes' | 'mime_type'> &
  Partial<Pick<Document, 'student_id' | 'college_id' | 'application_id' | 'description' | 'visibility'>>;

export type CreateDocumentVersionInput = Pick<DocumentVersion, 'document_id' | 'uploaded_by' | 'file_name' | 'file_url' | 'file_size_bytes' | 'mime_type'> &
  Partial<Pick<DocumentVersion, 'change_note'>>;

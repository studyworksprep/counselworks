import type { VisibilityScope } from '../families/types';

export type { VisibilityScope };

export type EssayType =
  | 'personal_statement'
  | 'common_app'
  | 'coalition_app'
  | 'supplemental'
  | 'scholarship'
  | 'why_us'
  | 'activity_description'
  | 'additional_info'
  | 'other';

export type EssayStatus = 'draft' | 'in_review' | 'revision_requested' | 'approved' | 'final';

export interface EssayDraft {
  id: string;
  firm_id: string;
  student_id: string;
  college_id: string | null;
  application_id: string | null;
  essay_type: EssayType;
  prompt: string | null;
  title: string;
  status: EssayStatus;
  word_limit: number | null;
  visibility: VisibilityScope;
  assigned_reviewer_id: string | null;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EssayDraftVersion {
  id: string;
  essay_draft_id: string;
  version_number: number;
  content: string;
  word_count: number;
  author_id: string;
  reviewer_comments: string | null;
  created_at: string;
}

export interface EssayDraftWithVersions extends EssayDraft {
  essay_draft_versions: EssayDraftVersion[];
}

export type CreateEssayDraftInput = Pick<EssayDraft, 'firm_id' | 'student_id' | 'essay_type' | 'title'> &
  Partial<Pick<EssayDraft, 'college_id' | 'application_id' | 'prompt' | 'word_limit' | 'visibility' | 'assigned_reviewer_id'>> & {
    initial_content?: string;
  };

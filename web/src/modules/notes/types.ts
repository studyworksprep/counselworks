export interface Note {
  id: string;
  firm_id: string;
  student_id: string | null;
  family_id: string | null;
  author_id: string;
  title: string | null;
  content: string;
  is_private: boolean;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface NoteWithAuthor extends Note {
  author: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export type CreateNoteInput = Pick<Note, 'firm_id' | 'author_id' | 'content'> &
  Partial<Pick<Note, 'student_id' | 'family_id' | 'title' | 'is_private'>>;

export type UpdateNoteInput = Partial<Pick<Note, 'title' | 'content' | 'is_private'>>;

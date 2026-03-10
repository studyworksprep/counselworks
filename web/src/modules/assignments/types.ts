export interface Assignment {
  id: string;
  firm_id: string;
  student_id: string;
  counselor_id: string;
  is_primary: boolean;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export interface AssignmentWithCounselor extends Assignment {
  users: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
  };
}

export interface AssignmentWithStudent extends Assignment {
  students: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    graduation_year: number | null;
    status: string;
  };
}

export type CreateAssignmentInput = Pick<Assignment, 'firm_id' | 'student_id' | 'counselor_id'> &
  Partial<Pick<Assignment, 'is_primary'>>;

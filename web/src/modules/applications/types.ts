export interface Application {
  id: string;
  firm_id: string;
  student_id: string;
  college_id: string;
  application_type: 'regular' | 'early_action' | 'early_decision' | 'early_decision_ii' | 'rolling' | 'restrictive_early_action';
  stage: string;
  status: 'in_progress' | 'submitted' | 'accepted' | 'rejected' | 'waitlisted' | 'deferred' | 'withdrawn';
  deadline: string | null;
  submitted_at: string | null;
  decision_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationWithCollege extends Application {
  colleges: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

export interface ApplicationWithStudent extends Application {
  students: {
    id: string;
    first_name: string;
    last_name: string;
  };
  colleges: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface ApplicationFilters {
  student_id?: string;
  college_id?: string;
  status?: Application['status'];
  application_type?: Application['application_type'];
  stage?: string;
}

export type CreateApplicationInput = Pick<Application, 'firm_id' | 'student_id' | 'college_id' | 'application_type'> &
  Partial<Pick<Application, 'stage' | 'deadline' | 'notes'>>;

export type UpdateApplicationInput = Partial<Omit<Application, 'id' | 'firm_id' | 'student_id' | 'college_id' | 'created_at' | 'updated_at'>>;

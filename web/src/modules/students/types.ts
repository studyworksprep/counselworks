export interface Student {
  id: string;
  firm_id: string;
  family_id: string | null;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  graduation_year: number | null;
  high_school: string | null;
  gpa_unweighted: number | null;
  gpa_weighted: number | null;
  status: 'active' | 'inactive' | 'archived' | 'graduated';
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  id: string;
  student_id: string;
  sat_score: number | null;
  act_score: number | null;
  sat_math: number | null;
  sat_reading: number | null;
  act_english: number | null;
  act_math: number | null;
  act_reading: number | null;
  act_science: number | null;
  intended_major: string | null;
  extracurriculars: string | null;
  awards: string | null;
  interests: string[];
  target_school_type: string | null;
  geographic_preferences: string[];
  financial_aid_needed: boolean;
  legacy_schools: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentWithProfile extends Student {
  student_profiles: StudentProfile | null;
}

export interface StudentFilters {
  status?: Student['status'];
  counselor_id?: string;
  graduation_year?: number;
  family_id?: string;
}

export type CreateStudentInput = Pick<Student, 'firm_id' | 'first_name' | 'last_name'> &
  Partial<Pick<Student, 'family_id' | 'user_id' | 'email' | 'phone' | 'date_of_birth' | 'graduation_year' | 'high_school' | 'gpa_unweighted' | 'gpa_weighted'>>;

export type UpdateStudentInput = Partial<Omit<Student, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;

export type UpsertStudentProfileInput = Omit<StudentProfile, 'id' | 'created_at' | 'updated_at'>;

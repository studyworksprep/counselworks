export interface College {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  country: string;
  website: string | null;
  logo_url: string | null;
  type: 'public' | 'private' | 'community' | 'other';
  acceptance_rate: number | null;
  avg_sat: number | null;
  avg_act: number | null;
  undergraduate_enrollment: number | null;
  tuition_in_state: number | null;
  tuition_out_of_state: number | null;
  ipeds_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentCollege {
  id: string;
  student_id: string;
  college_id: string;
  list_type: 'reach' | 'match' | 'safety' | 'undecided';
  interest_level: 'high' | 'medium' | 'low' | null;
  notes: string | null;
  visited: boolean;
  applied: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentCollegeWithCollege extends StudentCollege {
  colleges: College;
}

export type CreateCollegeInput = Pick<College, 'name' | 'slug' | 'country'> &
  Partial<Omit<College, 'id' | 'name' | 'slug' | 'country' | 'created_at' | 'updated_at'>>;

export type UpdateCollegeInput = Partial<Omit<College, 'id' | 'created_at' | 'updated_at'>>;

export type CreateStudentCollegeInput = Pick<StudentCollege, 'student_id' | 'college_id'> &
  Partial<Pick<StudentCollege, 'list_type' | 'interest_level' | 'notes'>>;

export type UpdateStudentCollegeInput = Partial<Omit<StudentCollege, 'id' | 'student_id' | 'college_id' | 'created_at' | 'updated_at'>>;

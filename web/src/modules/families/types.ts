export interface Family {
  id: string;
  firm_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  notes: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  relationship: 'parent' | 'guardian' | 'student' | 'sibling' | 'other';
  is_primary_contact: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateFamilyInput = Pick<Family, 'firm_id' | 'name'> &
  Partial<Pick<Family, 'phone' | 'email' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'zip' | 'country' | 'notes'>>;

export type UpdateFamilyInput = Partial<Omit<Family, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;

export type CreateFamilyMemberInput = Pick<FamilyMember, 'family_id' | 'first_name' | 'last_name' | 'relationship'> &
  Partial<Pick<FamilyMember, 'user_id' | 'email' | 'phone' | 'is_primary_contact'>>;

export type VisibilityScope = 'counselors_only' | 'family_visible' | 'student_visible';

export interface User {
  id: string;
  auth_provider_id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  status: 'active' | 'suspended' | 'deactivated';
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateUserInput = Pick<User, 'auth_provider_id' | 'email' | 'first_name' | 'last_name'> &
  Partial<Pick<User, 'avatar_url' | 'phone' | 'timezone'>>;

export type UpdateUserInput = Partial<Omit<User, 'id' | 'auth_provider_id' | 'created_at' | 'updated_at'>>;

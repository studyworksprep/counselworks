import type { Role } from '@/modules/permissions';

export interface Membership {
  id: string;
  firm_id: string;
  user_id: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended' | 'removed';
  invited_by_user_id: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipWithUser extends Membership {
  users: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface UserFirm extends Membership {
  firms: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

export type CreateMembershipInput = Pick<Membership, 'firm_id' | 'user_id' | 'role'> &
  Partial<Pick<Membership, 'status'>>;

export type UpdateMembershipRoleInput = { role: Role };

export type UpdateMembershipStatusInput = { status: Membership['status'] };

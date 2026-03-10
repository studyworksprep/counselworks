export interface Firm {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  timezone: string;
  status: 'active' | 'suspended' | 'cancelled';
  subscription_plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FirmSettings {
  id: string;
  firm_id: string;
  default_application_stages: string[];
  branding_primary_color: string | null;
  branding_accent_color: string | null;
  notification_preferences: Record<string, boolean>;
  features_enabled: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export type CreateFirmInput = Pick<Firm, 'name' | 'slug'> &
  Partial<Pick<Firm, 'logo_url' | 'website' | 'phone' | 'email' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'zip' | 'country' | 'timezone'>>;

export type UpdateFirmInput = Partial<Omit<Firm, 'id' | 'created_at' | 'updated_at'>>;

export type UpdateFirmSettingsInput = Partial<Omit<FirmSettings, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;

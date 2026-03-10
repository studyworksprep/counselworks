export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  tier: number;
  monthly_price_cents: number;
  annual_price_cents: number;
  max_seats: number | null;
  max_students: number | null;
  features_json: Record<string, unknown>;
  is_active: boolean;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

export type BillingInterval = 'monthly' | 'annual';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete';

export interface FirmSubscription {
  id: string;
  firm_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FirmSubscriptionWithPlan extends FirmSubscription {
  subscription_plans: SubscriptionPlan;
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface Invoice {
  id: string;
  firm_id: string;
  subscription_id: string | null;
  stripe_invoice_id: string | null;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  firm_id: string;
  stripe_payment_method_id: string;
  type: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSubscriptionInput {
  firm_id: string;
  plan_id: string;
  billing_interval: BillingInterval;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
}

export interface CreateInvoiceInput {
  firm_id: string;
  subscription_id?: string;
  stripe_invoice_id?: string;
  amount_cents: number;
  currency?: string;
  status?: InvoiceStatus;
  description?: string;
  period_start?: string;
  period_end?: string;
  due_at?: string;
}

export interface CreatePaymentMethodInput {
  firm_id: string;
  stripe_payment_method_id: string;
  type?: string;
  card_brand?: string;
  card_last4?: string;
  card_exp_month?: number;
  card_exp_year?: number;
  is_default?: boolean;
}

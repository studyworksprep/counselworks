import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SubscriptionPlan,
  FirmSubscription,
  FirmSubscriptionWithPlan,
  Invoice,
  PaymentMethod,
  CreateSubscriptionInput,
  CreateInvoiceInput,
  CreatePaymentMethodInput,
} from './types';

// ---------------------------------------------------------------------------
// Subscription Plans
// ---------------------------------------------------------------------------

export async function getActivePlans(
  client: SupabaseClient,
): Promise<{ data: SubscriptionPlan[]; error: Error | null }> {
  const { data, error } = await client
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .eq('is_internal', false)
    .order('tier', { ascending: true });

  return { data: (data as SubscriptionPlan[]) ?? [], error };
}

export async function getPlanBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<{ data: SubscriptionPlan | null; error: Error | null }> {
  const { data, error } = await client
    .from('subscription_plans')
    .select('*')
    .eq('slug', slug)
    .single();

  return { data: data as SubscriptionPlan | null, error };
}

export async function getInternalPlan(
  client: SupabaseClient,
): Promise<{ data: SubscriptionPlan | null; error: Error | null }> {
  const { data, error } = await client
    .from('subscription_plans')
    .select('*')
    .eq('slug', 'internal')
    .single();

  return { data: data as SubscriptionPlan | null, error };
}

// ---------------------------------------------------------------------------
// Firm Subscriptions
// ---------------------------------------------------------------------------

export async function getActiveSubscription(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: FirmSubscriptionWithPlan | null; error: Error | null }> {
  const { data, error } = await client
    .from('firm_subscriptions')
    .select('*, subscription_plans(*)')
    .eq('firm_id', firmId)
    .in('status', ['active', 'trialing', 'past_due'])
    .single();

  return { data: data as FirmSubscriptionWithPlan | null, error };
}

export async function getSubscriptionHistory(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: FirmSubscriptionWithPlan[]; error: Error | null }> {
  const { data, error } = await client
    .from('firm_subscriptions')
    .select('*, subscription_plans(*)')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false });

  return { data: (data as FirmSubscriptionWithPlan[]) ?? [], error };
}

export async function createSubscription(
  client: SupabaseClient,
  input: CreateSubscriptionInput,
): Promise<{ data: FirmSubscription | null; error: Error | null }> {
  const { data, error } = await client
    .from('firm_subscriptions')
    .insert({
      firm_id: input.firm_id,
      plan_id: input.plan_id,
      status: 'active',
      billing_interval: input.billing_interval,
      stripe_subscription_id: input.stripe_subscription_id ?? null,
      stripe_customer_id: input.stripe_customer_id ?? null,
      current_period_start: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (!error && data) {
    // Sync plan slug to firms table for quick lookups
    const { data: plan } = await client
      .from('subscription_plans')
      .select('slug')
      .eq('id', input.plan_id)
      .single();

    if (plan) {
      await client
        .from('firms')
        .update({
          subscription_plan: (plan as { slug: string }).slug,
          subscription_status: 'active',
          plan_type: (plan as { slug: string }).slug,
        })
        .eq('id', input.firm_id);
    }
  }

  return { data: data as FirmSubscription | null, error };
}

export async function updateSubscriptionStatus(
  client: SupabaseClient,
  subscriptionId: string,
  status: FirmSubscription['status'],
): Promise<{ data: FirmSubscription | null; error: Error | null }> {
  const payload: Record<string, unknown> = { status };

  if (status === 'canceled') {
    payload.canceled_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from('firm_subscriptions')
    .update(payload)
    .eq('id', subscriptionId)
    .select('*')
    .single();

  if (!error && data) {
    const sub = data as FirmSubscription;
    await client
      .from('firms')
      .update({ subscription_status: status })
      .eq('id', sub.firm_id);
  }

  return { data: data as FirmSubscription | null, error };
}

export async function cancelSubscription(
  client: SupabaseClient,
  subscriptionId: string,
  cancelAtPeriodEnd: boolean,
): Promise<{ data: FirmSubscription | null; error: Error | null }> {
  if (cancelAtPeriodEnd) {
    // Schedule cancellation at end of current period
    const { data: current } = await client
      .from('firm_subscriptions')
      .select('current_period_end')
      .eq('id', subscriptionId)
      .single();

    const { data, error } = await client
      .from('firm_subscriptions')
      .update({
        cancel_at: (current as { current_period_end: string } | null)?.current_period_end ?? new Date().toISOString(),
      })
      .eq('id', subscriptionId)
      .select('*')
      .single();

    return { data: data as FirmSubscription | null, error };
  }

  return updateSubscriptionStatus(client, subscriptionId, 'canceled');
}

// ---------------------------------------------------------------------------
// Internal (owner-firm) subscription helper
// ---------------------------------------------------------------------------

export async function assignInternalPlan(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: FirmSubscription | null; error: Error | null }> {
  const { data: plan, error: planError } = await getInternalPlan(client);
  if (planError || !plan) {
    return { data: null, error: planError ?? new Error('Internal plan not found') };
  }

  return createSubscription(client, {
    firm_id: firmId,
    plan_id: plan.id,
    billing_interval: 'annual',
  });
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function getInvoicesByFirm(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: Invoice[]; error: Error | null }> {
  const { data, error } = await client
    .from('invoices')
    .select('*')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false });

  return { data: (data as Invoice[]) ?? [], error };
}

export async function createInvoice(
  client: SupabaseClient,
  input: CreateInvoiceInput,
): Promise<{ data: Invoice | null; error: Error | null }> {
  const { data, error } = await client
    .from('invoices')
    .insert({
      firm_id: input.firm_id,
      subscription_id: input.subscription_id ?? null,
      stripe_invoice_id: input.stripe_invoice_id ?? null,
      amount_cents: input.amount_cents,
      currency: input.currency ?? 'usd',
      status: input.status ?? 'draft',
      description: input.description ?? null,
      period_start: input.period_start ?? null,
      period_end: input.period_end ?? null,
      due_at: input.due_at ?? null,
    })
    .select('*')
    .single();

  return { data: data as Invoice | null, error };
}

export async function updateInvoiceStatus(
  client: SupabaseClient,
  invoiceId: string,
  status: Invoice['status'],
  paidAt?: string,
): Promise<{ data: Invoice | null; error: Error | null }> {
  const payload: Record<string, unknown> = { status };
  if (status === 'paid') {
    payload.paid_at = paidAt ?? new Date().toISOString();
  }

  const { data, error } = await client
    .from('invoices')
    .update(payload)
    .eq('id', invoiceId)
    .select('*')
    .single();

  return { data: data as Invoice | null, error };
}

// ---------------------------------------------------------------------------
// Payment Methods
// ---------------------------------------------------------------------------

export async function getPaymentMethodsByFirm(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: PaymentMethod[]; error: Error | null }> {
  const { data, error } = await client
    .from('payment_methods')
    .select('*')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false });

  return { data: (data as PaymentMethod[]) ?? [], error };
}

export async function createPaymentMethod(
  client: SupabaseClient,
  input: CreatePaymentMethodInput,
): Promise<{ data: PaymentMethod | null; error: Error | null }> {
  // If this is the first or marked as default, clear existing defaults
  if (input.is_default) {
    await client
      .from('payment_methods')
      .update({ is_default: false })
      .eq('firm_id', input.firm_id);
  }

  const { data, error } = await client
    .from('payment_methods')
    .insert({
      ...input,
      is_default: input.is_default ?? false,
    })
    .select('*')
    .single();

  return { data: data as PaymentMethod | null, error };
}

export async function setDefaultPaymentMethod(
  client: SupabaseClient,
  firmId: string,
  paymentMethodId: string,
): Promise<{ error: Error | null }> {
  // Clear existing default
  await client
    .from('payment_methods')
    .update({ is_default: false })
    .eq('firm_id', firmId);

  const { error } = await client
    .from('payment_methods')
    .update({ is_default: true })
    .eq('id', paymentMethodId)
    .eq('firm_id', firmId);

  return { error };
}

export async function deletePaymentMethod(
  client: SupabaseClient,
  paymentMethodId: string,
): Promise<{ error: Error | null }> {
  const { error } = await client
    .from('payment_methods')
    .delete()
    .eq('id', paymentMethodId);

  return { error };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BillingRecipient {
  id: string;
  email: string;
  first_name: string;
}

/**
 * Who hears about a change to a household's invoices: the family's
 * parents/guardians with an email address. Placeholder (invited, not yet
 * claimed) users are included on purpose — the secure signing link (12.7)
 * lets an account-less household see and pay invoices, so the email is
 * their only notice.
 */
export async function householdBillingRecipients(
  db: SupabaseClient,
  firmId: string,
  familyId: string
): Promise<BillingRecipient[]> {
  const { data } = await db
    .from("family_members")
    .select("users:user_id(id, email, first_name)")
    .eq("firm_id", firmId)
    .eq("family_id", familyId)
    .in("relationship_type", ["parent", "guardian"]);
  const out: BillingRecipient[] = [];
  const seen = new Set<string>();
  for (const m of data ?? []) {
    const u = (Array.isArray(m.users) ? m.users[0] : m.users) as
      | { id: string; email: string | null; first_name: string | null }
      | null;
    if (!u?.email || seen.has(u.email)) continue;
    seen.add(u.email);
    out.push({ id: u.id, email: u.email, first_name: u.first_name ?? "there" });
  }
  return out;
}

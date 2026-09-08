import "server-only";
import { createServerClient } from "../db/client";
import { isValidSigningToken } from "./links";
import { stripeConfigured } from "../payments/client";
import {
  INVOICE_SUMMARY_SELECT,
  toInvoiceSummary,
  type AgreementInstallment,
  type InvoiceSummary,
} from "../db/queries";

/**
 * Public signing-link loader (fix plan 12.7).
 *
 * Service-role client (allowlisted, see docs/SECURITY.md): the recipient
 * opens /sign/<token> with no session — possibly no account at all — so
 * there is no user to scope a client with. Authorization is the secret
 * 48-hex token itself (unguessable, revoked on void, rotated on resend),
 * and everything the page and its actions touch is loaded from the ONE
 * agreement that token resolves to, then explicitly firm-scoped by that
 * agreement's firm_id. Nothing here accepts a caller-supplied firm or
 * family id.
 */

export interface SigningLinkContext {
  token: string;
  agreement: {
    id: string;
    firm_id: string;
    family_id: string;
    title: string;
    status: string;
    body_snapshot: string;
    document_hash: string;
    sent_at: string;
    completed_at: string | null;
    total_fee_cents: number | null;
    retainer_cents: number | null;
    signatures: { signer_role: string; signed_name: string; signed_at: string }[];
    installments: AgreementInstallment[];
  };
  recipient: { id: string; first_name: string; email: string };
  firm: { name: string; primaryColor: string | null; logoUrl: string | null };
  householdName: string;
  invoices: InvoiceSummary[];
  /** The firm has connected Stripe and this deployment has keys. */
  onlinePaymentAvailable: boolean;
  stripeAccountId: string | null;
}

interface AgreementRow {
  id: string;
  firm_id: string;
  family_id: string;
  title: string;
  status: string;
  body_snapshot: string;
  document_hash: string;
  sent_at: string;
  completed_at: string | null;
  total_fee_cents: number | null;
  retainer_cents: number | null;
  signing_recipient_user_id: string | null;
  agreement_signatures:
    | { signer_role: string; signed_name: string; signed_at: string }[]
    | null;
  agreement_installments: AgreementInstallment[] | null;
  families: { household_name: string } | { household_name: string }[] | null;
  firms: { name: string } | { name: string }[] | null;
}

export async function loadSigningLink(
  token: string
): Promise<SigningLinkContext | null> {
  // Reject junk before touching the database (same as the calendar feed).
  if (!isValidSigningToken(token)) return null;

  const db = createServerClient();
  const { data } = await db
    .from("service_agreements")
    .select(
      "id, firm_id, family_id, title, status, body_snapshot, document_hash, " +
        "sent_at, completed_at, total_fee_cents, retainer_cents, " +
        "signing_recipient_user_id, " +
        "agreement_signatures(signer_role, signed_name, signed_at), " +
        "agreement_installments(installment_number, label, amount_cents, is_retainer, due_on), " +
        "families:family_id(household_name), firms:firm_id(name)"
    )
    .eq("signing_token", token)
    .maybeSingle();
  const row = data as unknown as AgreementRow | null;
  // Voiding clears the token, but belt-and-braces: a voided agreement
  // never resolves.
  if (!row || row.status === "voided" || !row.signing_recipient_user_id) {
    return null;
  }

  const [{ data: recipient }, { data: settings }, { data: invoiceRows }] =
    await Promise.all([
      db
        .from("users")
        .select("id, first_name, email")
        .eq("id", row.signing_recipient_user_id)
        .maybeSingle(),
      db
        .from("firm_settings")
        .select("primary_color, branding_logo_url, stripe_account_id")
        .eq("firm_id", row.firm_id)
        .maybeSingle(),
      db
        .from("invoices")
        .select(INVOICE_SUMMARY_SELECT)
        .eq("firm_id", row.firm_id)
        .eq("agreement_id", row.id)
        .order("invoice_number", { ascending: true }),
    ]);
  if (!recipient) return null;

  const family = (Array.isArray(row.families) ? row.families[0] : row.families) as {
    household_name: string;
  } | null;
  const firm = (Array.isArray(row.firms) ? row.firms[0] : row.firms) as {
    name: string;
  } | null;

  const invoices: InvoiceSummary[] = (invoiceRows ?? []).map(toInvoiceSummary);

  const stripeAccountId = (settings?.stripe_account_id as string | null) ?? null;
  return {
    token,
    agreement: {
      id: row.id,
      firm_id: row.firm_id,
      family_id: row.family_id,
      title: row.title,
      status: row.status,
      body_snapshot: row.body_snapshot,
      document_hash: row.document_hash,
      sent_at: row.sent_at,
      completed_at: row.completed_at,
      total_fee_cents: row.total_fee_cents,
      retainer_cents: row.retainer_cents,
      signatures: row.agreement_signatures ?? [],
      installments: [...(row.agreement_installments ?? [])].sort(
        (a, b) => a.installment_number - b.installment_number
      ),
    },
    recipient,
    firm: {
      name: firm?.name ?? "Your counseling firm",
      primaryColor: (settings?.primary_color as string | null) ?? null,
      logoUrl: (settings?.branding_logo_url as string | null) ?? null,
    },
    householdName: family?.household_name ?? "Your family",
    invoices,
    onlinePaymentAvailable: stripeConfigured() && !!stripeAccountId,
    stripeAccountId,
  };
}

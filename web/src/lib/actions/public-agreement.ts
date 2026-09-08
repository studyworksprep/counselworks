"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { loadSigningLink } from "../agreements/signing-link";
import { recordAgreementSignature } from "../agreements/sign";
import { signingLinkPath } from "../agreements/links";
import { fetchAccountStatus } from "../payments/connect";
import { createInvoiceCheckoutSession } from "../payments/checkout";
import { partialPaymentProblem } from "../billing/invoices";
import { appBaseUrl } from "../agreements/links";

/**
 * Token-authorized agreement actions (fix plan 12.7): the household signs
 * and pays from the secure link with no login. Service-role client
 * (allowlisted, see docs/SECURITY.md) for the same reason as the loader —
 * there may be no user session at all. Every action re-resolves the token
 * through loadSigningLink and acts only on that agreement, as its
 * recipient; nothing accepts an id the token did not produce.
 */

async function requestEvidence() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: h.get("user-agent"),
  };
}

function revalidateAgreementSurfaces(link: {
  token: string;
  agreement: { id: string; family_id: string };
}) {
  revalidatePath(signingLinkPath(link.token));
  revalidatePath(`/families/${link.agreement.family_id}`);
  revalidatePath(`/families/${link.agreement.family_id}/billing`);
  revalidatePath("/family-dashboard");
  revalidatePath(`/family-agreements/${link.agreement.id}`);
  revalidatePath("/family-documents");
  revalidatePath("/documents");
  revalidatePath("/reports");
}

/** The recipient signs for the family from the link. */
export async function signAgreementByToken(token: string, formData: FormData) {
  const signedName = (formData.get("signed_name") as string)?.trim();
  const consent = formData.get("consent") === "on";
  if (!signedName) return { error: "Type your full legal name to sign" };
  if (!consent) {
    return {
      error: "You must consent to signing this agreement electronically",
    };
  }

  const link = await loadSigningLink(token);
  if (!link) return { error: "This signing link is no longer valid" };
  if (link.agreement.signatures.some((s) => s.signer_role === "family")) {
    return { error: "This agreement is already signed for your family" };
  }

  const result = await recordAgreementSignature(createServerClient(), {
    firmId: link.agreement.firm_id,
    agreement: { ...link.agreement, signing_token: token },
    signerUserId: link.recipient.id,
    signerRole: "family",
    signedName,
    consent,
    evidence: await requestEvidence(),
  });
  if ("error" in result) return { error: result.error };

  revalidateAgreementSurfaces(link);
  return { success: true, status: result.status };
}

/**
 * The recipient pays one of the agreement's open invoices from the link:
 * Stripe Checkout on the FIRM's connected account, exactly like the portal
 * Pay action, returning to the link afterwards. The invoice flips to paid
 * only when the verified webhook confirms the charge.
 */
export async function payInvoiceByToken(
  token: string,
  invoiceId: string,
  amountCents?: number
) {
  const link = await loadSigningLink(token);
  if (!link) return { error: "This link is no longer valid" };
  if (link.agreement.status !== "completed") {
    return { error: "Invoices become payable once the agreement is fully executed" };
  }
  const invoice = link.invoices.find((i) => i.id === invoiceId);
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "paid") return { error: "This invoice is already paid" };
  if (invoice.status !== "open") return { error: "This invoice cannot be paid" };
  // Full balance unless the payer chose a partial amount.
  const payCents = amountCents ?? invoice.balance_cents;
  const problem = partialPaymentProblem(payCents, invoice);
  if (problem) return { error: problem };
  if (!link.onlinePaymentAvailable || !link.stripeAccountId) {
    return { error: `${link.firm.name} hasn't enabled online payment yet` };
  }

  try {
    const status = await fetchAccountStatus(link.stripeAccountId);
    if (!status.chargesEnabled) {
      return { error: `${link.firm.name} hasn't finished payment setup yet` };
    }
    const url = await createInvoiceCheckoutSession({
      stripeAccountId: link.stripeAccountId,
      invoiceId: invoice.id,
      firmId: link.agreement.firm_id,
      payerUserId: link.recipient.id,
      payerEmail: link.recipient.email,
      invoiceNumber: invoice.invoice_number,
      installmentLabel: invoice.label,
      amountCents: payCents,
      partial: payCents < invoice.balance_cents,
      appUrl: appBaseUrl(),
      returnPath: signingLinkPath(token),
    });
    return { url };
  } catch (e) {
    console.error("Invoice checkout (link) failed:", e);
    return { error: "Could not start the payment — try again in a moment" };
  }
}

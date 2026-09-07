import {
  getFirmSettings,
  getAgreementTemplates,
  getWorkflowTemplates,
} from "@/lib/db/queries";
import { getMyNotificationPrefs } from "@/lib/actions/notifications";
import { getMyCalendarFeedToken } from "@/lib/actions/calendar-feed";
import { getMyBookingSettings } from "@/lib/db/queries";
import { stripeConfigured } from "@/lib/payments/client";
import { fetchAccountStatus } from "@/lib/payments/connect";
import type { StripeSectionStatus } from "./settings-client";
import { SettingsClient } from "./settings-client";

/**
 * Live Connect status for the Payments card (fix plan 12.4). Stripe is the
 * source of truth for onboarding state; a fetch failure degrades to
 * "unavailable" rather than breaking Settings.
 */
async function getStripeSectionStatus(
  settings: { stripe_account_id?: string | null } | null
): Promise<StripeSectionStatus> {
  if (!stripeConfigured()) return { kind: "unconfigured" };
  const accountId = settings?.stripe_account_id ?? null;
  if (!accountId) return { kind: "not_connected" };
  try {
    const status = await fetchAccountStatus(accountId);
    return { kind: "connected", ...status };
  } catch (e) {
    console.error("Stripe status fetch failed:", e);
    return { kind: "unavailable" };
  }
}

export default async function SettingsPage() {
  const [
    data,
    agreementTemplates,
    notificationPrefs,
    calendarFeedToken,
    workflowTemplates,
    booking,
  ] = await Promise.all([
    getFirmSettings(),
    getAgreementTemplates(),
    getMyNotificationPrefs(),
    getMyCalendarFeedToken(),
    getWorkflowTemplates({ activeOnly: true }),
    getMyBookingSettings(),
  ]);
  const stripeStatus = await getStripeSectionStatus(
    (data?.settings ?? null) as { stripe_account_id?: string | null } | null
  );
  return (
    <SettingsClient
      data={data}
      agreementTemplates={agreementTemplates}
      notificationPrefs={notificationPrefs}
      calendarFeedToken={calendarFeedToken}
      stripeStatus={stripeStatus}
      booking={booking}
      workflowTemplates={workflowTemplates
        .filter((t) => t.instantiation_scope === "student")
        .map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}

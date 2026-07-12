import { getFirmSettings, getAgreementTemplates } from "@/lib/db/queries";
import { getMyNotificationPrefs } from "@/lib/actions/notifications";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [data, agreementTemplates, notificationPrefs] = await Promise.all([
    getFirmSettings(),
    getAgreementTemplates(),
    getMyNotificationPrefs(),
  ]);
  return (
    <SettingsClient
      data={data}
      agreementTemplates={agreementTemplates}
      notificationPrefs={notificationPrefs}
    />
  );
}

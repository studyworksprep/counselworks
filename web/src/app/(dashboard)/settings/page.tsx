import { getFirmSettings, getAgreementTemplates } from "@/lib/db/queries";
import { getMyNotificationPrefs } from "@/lib/actions/notifications";
import { getMyCalendarFeedToken } from "@/lib/actions/calendar-feed";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [data, agreementTemplates, notificationPrefs, calendarFeedToken] =
    await Promise.all([
      getFirmSettings(),
      getAgreementTemplates(),
      getMyNotificationPrefs(),
      getMyCalendarFeedToken(),
    ]);
  return (
    <SettingsClient
      data={data}
      agreementTemplates={agreementTemplates}
      notificationPrefs={notificationPrefs}
      calendarFeedToken={calendarFeedToken}
    />
  );
}

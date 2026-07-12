import {
  getFirmSettings,
  getAgreementTemplates,
  getWorkflowTemplates,
} from "@/lib/db/queries";
import { getMyNotificationPrefs } from "@/lib/actions/notifications";
import { getMyCalendarFeedToken } from "@/lib/actions/calendar-feed";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [
    data,
    agreementTemplates,
    notificationPrefs,
    calendarFeedToken,
    workflowTemplates,
  ] = await Promise.all([
    getFirmSettings(),
    getAgreementTemplates(),
    getMyNotificationPrefs(),
    getMyCalendarFeedToken(),
    getWorkflowTemplates({ activeOnly: true }),
  ]);
  return (
    <SettingsClient
      data={data}
      agreementTemplates={agreementTemplates}
      notificationPrefs={notificationPrefs}
      calendarFeedToken={calendarFeedToken}
      workflowTemplates={workflowTemplates
        .filter((t) => t.instantiation_scope === "student")
        .map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}

import { PageShell } from "@/components/layout/page-shell";
import { NotificationPrefsCard } from "@/components/notifications/prefs-card";
import { getMyNotificationPrefs } from "@/lib/actions/notifications";
export default async function PersonalSettingsPage() {
  return <PageShell title="My settings" description="Your personal notification preferences"><div className="max-w-2xl"><NotificationPrefsCard prefs={await getMyNotificationPrefs()}/></div></PageShell>;
}

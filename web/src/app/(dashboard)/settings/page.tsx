import { getFirmSettings } from "@/lib/db/queries";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const data = await getFirmSettings();
  return <SettingsClient data={data} />;
}

import { getFirmSettings, getAgreementTemplates } from "@/lib/db/queries";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [data, agreementTemplates] = await Promise.all([
    getFirmSettings(),
    getAgreementTemplates(),
  ]);
  return (
    <SettingsClient data={data} agreementTemplates={agreementTemplates} />
  );
}

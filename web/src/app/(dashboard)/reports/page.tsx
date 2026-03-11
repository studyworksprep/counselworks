import { getReportData } from "@/lib/db/queries";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const data = await getReportData();
  return <ReportsClient data={data} />;
}

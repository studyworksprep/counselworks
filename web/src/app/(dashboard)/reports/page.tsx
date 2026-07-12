import {
  getReportData,
  getDecisionRoster,
  getStaffForSelect,
} from "@/lib/db/queries";
import { ReportsClient } from "./reports-client";

interface Props {
  searchParams: Promise<{ class_year?: string; counselor_id?: string }>;
}

export default async function ReportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = {
    classYear: params.class_year,
    counselorId: params.counselor_id,
  };
  const [data, roster, staff] = await Promise.all([
    getReportData(filters),
    getDecisionRoster(filters),
    getStaffForSelect(),
  ]);
  return <ReportsClient data={data} roster={roster} staff={staff} />;
}

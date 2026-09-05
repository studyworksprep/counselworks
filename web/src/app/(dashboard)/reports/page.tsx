import {
  getReportData,
  getDecisionRoster,
  getStaffForSelect,
  getListBalanceReport,
  getAccountsReceivable,
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
  const [data, roster, staff, listBalance, receivables] = await Promise.all([
    getReportData(filters),
    getDecisionRoster(filters),
    getStaffForSelect(),
    getListBalanceReport(),
    getAccountsReceivable(filters),
  ]);
  return (
    <ReportsClient
      data={data}
      roster={roster}
      staff={staff}
      listBalance={listBalance}
      receivables={receivables}
    />
  );
}

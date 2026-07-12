import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { computeNetCost, formatUsd } from "@/lib/constants/aid";
import { ROUND_SHORT_LABELS } from "@/lib/constants/applications";
import type { AidComparisonRow } from "@/lib/db/queries";

/**
 * Net-cost comparison across acceptances (fix plan 10.6). Server component;
 * shared by the staff colleges page and the family portal. `linkBase` adds
 * staff-only deep links to the application detail page.
 */
export function NetCostComparison({
  rows,
  linkBase,
  title = "Net Cost Comparison",
}: {
  rows: AidComparisonRow[];
  linkBase?: string;
  title?: string;
}) {
  if (rows.length === 0) return null;

  const computed = rows
    .map((row) => ({
      row,
      net: computeNetCost({
        costOfAttendance: row.cost_of_attendance,
        tuitionEstimate: row.tuition_estimate,
        awards: row.awards,
      }),
    }))
    .sort((a, b) => (a.net.netCost ?? Infinity) - (b.net.netCost ?? Infinity));

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="mt-0.5 text-sm text-gray-500">
          Annual figures across acceptances. Gift aid (scholarships and
          grants) reduces net cost; loans and work-study do not.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">College</th>
                <th className="pb-2 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Gift aid</th>
                <th className="pb-2 font-medium text-right">Loans/W-S</th>
                <th className="pb-2 font-medium text-right">Net cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {computed.map(({ row, net }) => (
                <tr key={row.application_id}>
                  <td className="py-2.5">
                    {linkBase ? (
                      <Link
                        href={`${linkBase}/${row.application_id}`}
                        className="font-medium text-primary-600 hover:text-primary-700"
                      >
                        {row.college_name}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-900">
                        {row.college_name}
                      </span>
                    )}
                    <p className="text-xs text-gray-400">
                      {row.round
                        ? ROUND_SHORT_LABELS[row.round] ?? row.round
                        : ""}
                      {row.deposit_status === "committed" && " · Committed"}
                    </p>
                  </td>
                  <td className="py-2.5 text-right text-gray-700">
                    {formatUsd(net.cost)}
                    {net.costSource === "tuition_estimate" && (
                      <span className="ml-1 text-xs text-gray-400">est.</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-success-700">
                    {net.giftAid > 0 ? `−${formatUsd(net.giftAid)}` : "—"}
                  </td>
                  <td className="py-2.5 text-right text-gray-500">
                    {net.otherAid > 0 ? formatUsd(net.otherAid) : "—"}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">
                    {formatUsd(net.netCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import {
  addAidAward,
  deleteAidAward,
  setApplicationCost,
} from "@/lib/actions/aid";
import {
  AID_KINDS,
  AID_KIND_LABELS,
  isGiftAid,
  computeNetCost,
  formatUsd,
} from "@/lib/constants/aid";

export interface AidAwardItem {
  id: string;
  kind: string;
  name: string;
  annual_amount: number;
  renewable: boolean;
  notes?: string | null;
}

/**
 * Financial aid on the application detail page (fix plan 10.6): the award
 * letter's cost of attendance, individual awards, and the resulting net cost.
 */
export function AidAwardsCard({
  applicationId,
  costOfAttendance,
  tuitionEstimate,
  awards,
}: {
  applicationId: string;
  costOfAttendance: number | null;
  tuitionEstimate: number | null;
  awards: AidAwardItem[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const net = computeNetCost({ costOfAttendance, tuitionEstimate, awards });

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addAidAward(applicationId, formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setShowAdd(false);
      router.refresh();
    });
  }

  function handleDelete(awardId: string) {
    startTransition(async () => {
      await deleteAidAward(awardId);
      router.refresh();
    });
  }

  function handleCostBlur(e: React.FocusEvent<HTMLInputElement>) {
    const formData = new FormData();
    formData.set("cost_of_attendance", e.target.value);
    startTransition(async () => {
      const result = await setApplicationCost(applicationId, formData);
      if ("error" in result && result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Financial Aid</h3>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "Close" : "Add Award"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <Alert className="mb-3">{error}</Alert>}

        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Cost of attendance (annual)
            </label>
            <Input
              name="cost_of_attendance"
              defaultValue={costOfAttendance ?? ""}
              placeholder={
                tuitionEstimate ? `est. ${formatUsd(tuitionEstimate)}` : "$"
              }
              onBlur={handleCostBlur}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Gift aid</p>
            <p className="py-2 text-sm font-semibold text-success-700">
              {formatUsd(net.giftAid)}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">
              Loans / work-study
            </p>
            <p className="py-2 text-sm text-gray-700">{formatUsd(net.otherAid)}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">
              Net cost / year
            </p>
            <p className="py-2 text-sm font-semibold text-gray-900">
              {formatUsd(net.netCost)}
              {net.costSource === "tuition_estimate" && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (est.)
                </span>
              )}
            </p>
          </div>
        </div>

        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <Select
                name="kind"
                label="Type *"
                required
                placeholder="Select type"
                options={AID_KINDS.map((k) => ({
                  value: k.value,
                  label: k.label,
                }))}
              />
              <Input
                name="annual_amount"
                label="Annual amount *"
                placeholder="$12,000"
                required
              />
            </div>
            <Input
              name="name"
              label="Name *"
              placeholder="e.g. Presidential Scholarship"
              required
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="renewable"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              Renewable all four years
            </label>
            <Input name="notes" label="Notes" placeholder="Conditions, GPA requirement…" />
            <Button type="submit" size="sm" loading={isPending}>
              Save Award
            </Button>
          </form>
        )}

        {awards.length === 0 ? (
          <p className="text-sm text-gray-500">
            No awards recorded yet. Add them from the award letter once
            decisions arrive.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {awards.map((award) => (
              <li
                key={award.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {award.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {AID_KIND_LABELS[award.kind] ?? award.kind}
                    {award.renewable ? " · renewable" : " · one year only"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={isGiftAid(award.kind) ? "success" : "default"}>
                    {formatUsd(award.annual_amount)}/yr
                  </Badge>
                  <button
                    onClick={() => handleDelete(award.id)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-danger-500"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

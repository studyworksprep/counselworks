"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  approveDiscrepancyFlag,
  rejectDiscrepancyFlag,
  triggerScorecardIngest,
} from "@/lib/actions/college-discrepancies";

interface Flag {
  id: string;
  college_id: string;
  college_name: string;
  college_scorecard_id: number | null;
  kind: "field_diff" | "potential_duplicate";
  field_name: string | null;
  current_value: string | null;
  proposed_value: string | null;
  proposed_scorecard_id: number | null;
  claude_classification: "meaningful" | "cosmetic" | null;
  claude_assessment: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  applied_at: string | null;
}

interface Props {
  flags: Flag[];
  pendingCount: number;
  meaningfulCount: number;
  activeStatus: string;
  activeClassification: string;
  activeKind: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  city: "City",
  state_region: "State",
  website_url: "Website",
  institution_type: "Institution type",
  locale_type: "Locale",
};

const STATUS_VARIANT: Record<Flag["status"], "primary" | "success" | "default"> =
  {
    pending: "primary",
    approved: "success",
    rejected: "default",
  };

export function DiscrepanciesClient({
  flags,
  pendingCount,
  meaningfulCount,
  activeStatus,
  activeClassification,
  activeKind,
}: Props) {
  const confirmDialog = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSuccess, setTriggerSuccess] = useState(false);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`/colleges/discrepancies?${params.toString()}`);
  }

  async function triggerIngest() {
    setTriggerError(null);
    setTriggerSuccess(false);
    if (
      !(await confirmDialog({
        title: "Queue the full Scorecard ingest?",
        body: "This adds new colleges and creates discrepancy flags. Existing rows are not modified.",
        confirmLabel: "Queue ingest",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await triggerScorecardIngest();
      if ("error" in result) setTriggerError(result.error);
      else setTriggerSuccess(true);
    });
  }

  // Group flags by college for readability
  const grouped: Array<{ collegeName: string; collegeId: string; rows: Flag[] }> = [];
  const collegeIndex = new Map<string, number>();
  for (const flag of flags) {
    const idx = collegeIndex.get(flag.college_id);
    if (idx === undefined) {
      collegeIndex.set(flag.college_id, grouped.length);
      grouped.push({
        collegeName: flag.college_name,
        collegeId: flag.college_id,
        rows: [flag],
      });
    } else {
      grouped[idx].rows.push(flag);
    }
  }

  return (
    <PageShell
      title="College catalog discrepancies"
      description="Review proposed catalog changes from the Scorecard ingest. No change is applied until you approve it."
      actions={
        <Button onClick={triggerIngest} disabled={isPending} size="sm">
          {isPending ? "Queueing..." : "Run Scorecard ingest"}
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Pending
          </p>
          <p className="text-2xl font-semibold text-gray-900">{pendingCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Pending meaningful
          </p>
          <p className="text-2xl font-semibold text-gray-900">
            {meaningfulCount}
          </p>
        </div>
        {triggerError && (
          <div className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {triggerError}
          </div>
        )}
        {triggerSuccess && (
          <div className="rounded-md bg-success-50 px-3 py-2 text-sm text-success-700">
            Ingest queued — watch Inngest for progress.
          </div>
        )}
      </div>

      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <FilterGroup
              label="Status"
              value={activeStatus}
              onChange={(v) => setFilter("status", v)}
              options={[
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "all", label: "All" },
              ]}
            />
            <FilterGroup
              label="Claude classification"
              value={activeClassification}
              onChange={(v) => setFilter("classification", v)}
              options={[
                { value: "all", label: "Any" },
                { value: "meaningful", label: "Meaningful only" },
                { value: "cosmetic", label: "Cosmetic only" },
              ]}
            />
            <FilterGroup
              label="Kind"
              value={activeKind}
              onChange={(v) => setFilter("kind", v)}
              options={[
                { value: "all", label: "All kinds" },
                { value: "field_diff", label: "Field diffs" },
                { value: "potential_duplicate", label: "Potential duplicates" },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {grouped.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <p className="text-sm text-gray-600">
            No discrepancies match these filters.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <CollegeGroup key={group.collegeId} group={group} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              value === option.value
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-gray-300 text-gray-700 hover:border-gray-400"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CollegeGroup({
  group,
}: {
  group: { collegeName: string; collegeId: string; rows: Flag[] };
}) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold text-gray-900">
          {group.collegeName}
        </h3>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-gray-100">
          {group.rows.map((flag) => (
            <FlagRow key={flag.id} flag={flag} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FlagRow({ flag }: { flag: Flag }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveDiscrepancyFlag(flag.id);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectDiscrepancyFlag(flag.id);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        {flag.kind === "potential_duplicate" ? (
          <Badge variant="warning">Potential duplicate</Badge>
        ) : (
          <Badge variant="default">
            {flag.field_name ? FIELD_LABELS[flag.field_name] ?? flag.field_name : "Field"}
          </Badge>
        )}
        {flag.claude_classification === "meaningful" && (
          <Badge variant="danger">Meaningful</Badge>
        )}
        {flag.claude_classification === "cosmetic" && (
          <Badge variant="default">Cosmetic</Badge>
        )}
        <Badge variant={STATUS_VARIANT[flag.status]}>{flag.status}</Badge>
        <span className="ml-auto text-xs text-gray-500">
          {format(parseISO(flag.created_at), "MMM d, yyyy")}
        </span>
      </div>

      {flag.kind === "field_diff" ? (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ValueBlock label="Current (our DB)" value={flag.current_value} muted />
          <ValueBlock
            label="Proposed (Scorecard)"
            value={flag.proposed_value}
          />
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-700">
          Scorecard institution{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
            {flag.proposed_scorecard_id}
          </code>{" "}
          has the same name as this college, which has no IPEDS ID set.
          Approving links the IPEDS ID to this row (no other field changes).
        </p>
      )}

      {flag.claude_assessment && (
        <div className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span className="font-medium">Claude:</span> {flag.claude_assessment}
        </div>
      )}

      {flag.status === "pending" && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={approve} disabled={isPending}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={reject}
            disabled={isPending}
          >
            Reject
          </Button>
          {error && <span className="text-sm text-danger-600">{error}</span>}
        </div>
      )}

      {flag.status !== "pending" && flag.applied_at && (
        <p className="mt-2 text-xs text-gray-500">
          Applied {format(parseISO(flag.applied_at), "MMM d, yyyy 'at' HH:mm")}
        </p>
      )}
    </li>
  );
}

function ValueBlock({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | null;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        muted ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-gray-900 break-words">
        {value ?? <span className="italic text-gray-400">empty</span>}
      </p>
    </div>
  );
}

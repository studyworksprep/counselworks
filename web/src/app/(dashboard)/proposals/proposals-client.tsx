"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCents } from "@/lib/agreements/schedule";
import { formatDate } from "@/lib/utils";
import {
  PROPOSAL_DISPLAY_BADGES,
  PROPOSAL_DISPLAY_LABELS,
} from "@/lib/constants/proposals";
import type { ProposalSummary } from "@/lib/db/queries";

// Filters by the STORED status; "Sent" therefore includes proposals that
// have since expired (expiry is derived, shown on the row's badge).
const STATUS_FILTERS = [
  { value: "", label: "All proposals" },
  { value: "draft", label: "Drafts" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

function buildColumns(firmWide: boolean): Column<ProposalSummary>[] {
  const columns: Column<ProposalSummary>[] = [
    {
      key: "client",
      header: "Client",
      render: (row) => (
        <div>
          {/* A real link, so the row is reachable by keyboard and screen
              reader; the row's own click handler covers the mouse. */}
          <Link
            href={`/proposals/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-gray-900 hover:text-primary-700 hover:underline"
          >
            {row.parent_name}
          </Link>
          <p className="text-xs text-gray-500">
            {row.student_name} · Class of {row.graduation_year}
          </p>
        </div>
      ),
    },
    {
      key: "title",
      header: "Proposal",
      render: (row) => <span className="text-gray-700">{row.title}</span>,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (row) => (
        <span className="text-gray-900">
          {formatCents(row.discounted_cost_cents)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={PROPOSAL_DISPLAY_BADGES[row.display_status] ?? "default"}>
          {PROPOSAL_DISPLAY_LABELS[row.display_status] ?? row.display_status}
        </Badge>
      ),
    },
    {
      key: "sent",
      header: "Sent",
      render: (row) => (
        <span className="text-gray-600">
          {row.sent_on ? formatDate(row.sent_on) : "—"}
        </span>
      ),
    },
    {
      key: "valid_until",
      header: "Valid through",
      render: (row) => (
        <span className="text-gray-600">{formatDate(row.valid_until)}</span>
      ),
    },
  ];
  if (firmWide) {
    columns.push({
      key: "author",
      header: "Prepared by",
      render: (row) => (
        <span className="text-gray-600">{row.author_name ?? "—"}</span>
      ),
    });
  }
  return columns;
}

export function ProposalsClient({
  proposals,
  pagination,
  firmWide,
}: {
  proposals: ProposalSummary[];
  pagination: { page: number; pageSize: number; total: number };
  /** Owners/admins see every counselor's proposals, with who wrote each. */
  firmWide: boolean;
}) {
  const router = useRouter();
  const { searchParams, setParam, setSearchParamDebounced, setParams } =
    useDebouncedFilter("/proposals");
  const filtered = !!searchParams.get("status") || !!searchParams.get("search");

  return (
    <PageShell
      title="Proposals"
      description="Offers to prospective clients — sent by link, approved online, and turned into service agreements"
      actions={
        <Button onClick={() => router.push("/proposals/new")}>
          New proposal
        </Button>
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              aria-label="Search proposals"
              placeholder="Search by parent, student, or title..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => setSearchParamDebounced("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              aria-label="Filter by status"
              value={searchParams.get("status") ?? ""}
              onChange={(e) => setParam("status", e.target.value)}
              options={STATUS_FILTERS}
              className="w-44"
            />
          </div>
        </div>

        {proposals.length === 0 ? (
          <EmptyState
            title={filtered ? "No proposals match" : "No proposals yet"}
            description={
              filtered
                ? "Try a different search or status."
                : "Write a proposal for a prospective family: services, price, payment schedule, and terms. They review and approve it from a private link."
            }
            actionLabel={filtered ? undefined : "New proposal"}
            onAction={filtered ? undefined : () => router.push("/proposals/new")}
          />
        ) : (
          <DataTable
            columns={buildColumns(firmWide)}
            data={proposals}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => router.push(`/proposals/${p.id}`)}
            server={{
              page: pagination.page,
              pageSize: pagination.pageSize,
              total: pagination.total,
              // Newest first, fixed: no column here is server-sortable.
              sort: null,
              onPageChange: (p) => setParams({ page: String(p) }),
              onSortChange: () => {},
            }}
          />
        )}
      </Card>
    </PageShell>
  );
}

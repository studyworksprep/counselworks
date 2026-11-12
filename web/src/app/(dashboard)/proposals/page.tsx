import { notFound } from "next/navigation";
import { getProposals } from "@/lib/db/queries";
import { parseListParams } from "@/lib/list-params";
import { ProposalsClient } from "./proposals-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
  }>;
}

/**
 * Client proposals (migration 00051): what has been offered to prospective
 * clients and where each one stands. Client-management staff only — owners
 * and admins see the firm's, a counselor their own (`getProposals` returns
 * null for everyone else, and the page 404s rather than render an empty
 * table that looks like "no proposals yet").
 */
export default async function ProposalsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { page } = parseListParams(params, []);
  const proposals = await getProposals({
    status: params.status,
    search: params.search,
    page,
  });
  if (!proposals) return notFound();

  return (
    <ProposalsClient
      proposals={proposals.rows}
      pagination={{
        page: proposals.page,
        pageSize: proposals.pageSize,
        total: proposals.total,
      }}
      firmWide={proposals.firmWide}
    />
  );
}

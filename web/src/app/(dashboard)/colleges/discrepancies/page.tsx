import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getDb } from "@/lib/db/client";
import { hasPermission } from "@/modules/permissions/service";
import { DiscrepanciesClient } from "./discrepancies-client";

interface Props {
  searchParams: Promise<{
    status?: string;
    classification?: string;
    kind?: string;
  }>;
}

export default async function CollegeDiscrepanciesPage({
  searchParams,
}: Props) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return redirect("/sign-in");

  const isAdmin = hasPermission(
    {
      userId: ctx.userId,
      firmId: ctx.firmId,
      role: ctx.role,
      assignedStudentIds: [],
    },
    "manage_firm",
  );

  if (!isAdmin) {
    return (
      <PageShell
        title="College discrepancies"
        description="Admin-only — review proposed catalog changes from the Scorecard ingest."
      >
        <Card className="px-6 py-8 text-center text-sm text-gray-600">
          You need firm admin permissions to review the college catalog.
        </Card>
      </PageShell>
    );
  }

  const params = await searchParams;
  const statusFilter = params.status ?? "pending";
  const classificationFilter = params.classification ?? "all";
  const kindFilter = params.kind ?? "all";

  const db = getDb();

  let query = db
    .from("college_discrepancy_flags")
    .select(
      `id, college_id, kind, field_name, current_value, proposed_value,
       proposed_scorecard_id, claude_classification, claude_assessment,
       status, created_at, applied_at,
       colleges(id, name, scorecard_id)`,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (classificationFilter === "meaningful") {
    query = query.eq("claude_classification", "meaningful");
  } else if (classificationFilter === "cosmetic") {
    query = query.eq("claude_classification", "cosmetic");
  }
  if (kindFilter !== "all") {
    query = query.eq("kind", kindFilter);
  }

  const { data: rawFlags } = await query;

  const flags = (rawFlags ?? []).map((flag) => {
    const college = Array.isArray(flag.colleges)
      ? flag.colleges[0]
      : (flag.colleges as { id: string; name: string; scorecard_id: number | null } | null);
    return {
      id: flag.id as string,
      college_id: flag.college_id as string,
      college_name: college?.name ?? "Unknown",
      college_scorecard_id: college?.scorecard_id ?? null,
      kind: flag.kind as "field_diff" | "potential_duplicate",
      field_name: flag.field_name as string | null,
      current_value: flag.current_value as string | null,
      proposed_value: flag.proposed_value as string | null,
      proposed_scorecard_id: flag.proposed_scorecard_id as number | null,
      claude_classification:
        (flag.claude_classification as "meaningful" | "cosmetic" | null) ??
        null,
      claude_assessment: flag.claude_assessment as string | null,
      status: flag.status as "pending" | "approved" | "rejected",
      created_at: flag.created_at as string,
      applied_at: flag.applied_at as string | null,
    };
  });

  // Pending counts for the header (independent of current filters)
  const [{ count: pendingCount }, { count: meaningfulCount }] =
    await Promise.all([
      db
        .from("college_discrepancy_flags")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      db
        .from("college_discrepancy_flags")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("claude_classification", "meaningful"),
    ]);

  return (
    <DiscrepanciesClient
      flags={flags}
      pendingCount={pendingCount ?? 0}
      meaningfulCount={meaningfulCount ?? 0}
      activeStatus={statusFilter}
      activeClassification={classificationFilter}
      activeKind={kindFilter}
    />
  );
}

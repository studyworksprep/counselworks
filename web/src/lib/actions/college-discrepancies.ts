"use server";

import { revalidatePath } from "next/cache";
import { resolveUserAndFirm } from "../auth/resolve";
import { createServerClient } from "../db/client";
import { hasPermission } from "@/modules/permissions/service";
import { inngest } from "../queue/inngest";

async function requireFirmAdmin() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };
  const ok = hasPermission(
    {
      userId: ctx.userId,
      firmId: ctx.firmId,
      role: ctx.role,
      assignedStudentIds: [],
    },
    "manage_firm",
  );
  if (!ok) return { error: "Admin only" as const };
  return { ctx };
}

type ActionResult = { error: string } | { success: true };

/**
 * Approves a discrepancy flag and applies the proposed change to the
 * colleges table. For 'field_diff' flags, this writes proposed_value into
 * the named column. For 'potential_duplicate' flags, this links the
 * existing row to the Scorecard IPEDS id (rather than treating the
 * Scorecard record as a separate college).
 *
 * In both cases the flag's status moves to 'approved' and applied_at is set.
 */
export async function approveDiscrepancyFlag(
  flagId: string,
): Promise<ActionResult> {
  const auth = await requireFirmAdmin();
  if ("error" in auth) return { error: auth.error };
  const { ctx } = auth;

  const db = createServerClient();
  const { data: flag } = await db
    .from("college_discrepancy_flags")
    .select(
      "id, college_id, kind, field_name, proposed_value, proposed_scorecard_id, status",
    )
    .eq("id", flagId)
    .single();

  if (!flag) return { error: "Flag not found" };
  if (flag.status !== "pending") {
    return { error: "Flag is no longer pending" };
  }

  const now = new Date().toISOString();

  if (flag.kind === "field_diff") {
    if (!flag.field_name || flag.proposed_value === null) {
      return { error: "Flag is malformed" };
    }
    // Allowlist: only columns the ingest job ever flags, so a malicious
    // or buggy flag row can't write to arbitrary columns.
    const ALLOWED = new Set([
      "name",
      "city",
      "state_region",
      "website_url",
      "institution_type",
      "locale_type",
    ]);
    if (!ALLOWED.has(flag.field_name)) {
      return { error: "Cannot apply changes to that column" };
    }
    const { error: updateError } = await db
      .from("colleges")
      .update({ [flag.field_name]: flag.proposed_value })
      .eq("id", flag.college_id as string);
    if (updateError) {
      console.error("Failed to apply discrepancy:", updateError);
      return { error: "Failed to apply change" };
    }
  } else if (flag.kind === "potential_duplicate") {
    if (!flag.proposed_scorecard_id) {
      return { error: "Flag is malformed" };
    }
    const { error: updateError } = await db
      .from("colleges")
      .update({ scorecard_id: flag.proposed_scorecard_id })
      .eq("id", flag.college_id as string);
    if (updateError) {
      console.error("Failed to link duplicate:", updateError);
      return { error: "Failed to link Scorecard ID" };
    }
  }

  await db
    .from("college_discrepancy_flags")
    .update({
      status: "approved",
      reviewed_by_user_id: ctx.dbUserId,
      reviewed_at: now,
      applied_at: now,
    })
    .eq("id", flagId);

  revalidatePath("/colleges/discrepancies");
  return { success: true as const };
}

export async function rejectDiscrepancyFlag(
  flagId: string,
): Promise<ActionResult> {
  const auth = await requireFirmAdmin();
  if ("error" in auth) return { error: auth.error };
  const { ctx } = auth;

  const db = createServerClient();
  const { data: flag } = await db
    .from("college_discrepancy_flags")
    .select("id, status")
    .eq("id", flagId)
    .single();

  if (!flag) return { error: "Flag not found" };
  if (flag.status !== "pending") {
    return { error: "Flag is no longer pending" };
  }

  const { error: updateError } = await db
    .from("college_discrepancy_flags")
    .update({
      status: "rejected",
      reviewed_by_user_id: ctx.dbUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", flagId);

  if (updateError) return { error: "Failed to reject" };

  revalidatePath("/colleges/discrepancies");
  return { success: true as const };
}

export async function triggerScorecardIngest(): Promise<ActionResult> {
  const auth = await requireFirmAdmin();
  if ("error" in auth) return { error: auth.error };

  await inngest.send({
    name: "colleges/bulk-ingest-scorecard",
    data: { mode: "tight" },
  });

  revalidatePath("/colleges/discrepancies");
  return { success: true as const };
}

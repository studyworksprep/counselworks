import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort audit trail (fix plan 6.3). Feeds the dashboard's Recent
 * Activity panel and gives sensitive actions a durable record. Never throws:
 * an audit failure must not fail the action it describes.
 */
export async function recordAuditEvent(
  db: SupabaseClient,
  event: {
    firmId: string;
    actorUserId: string | null;
    entityType: string;
    entityId?: string | null;
    actionType: string;
    /** Human-readable one-liner rendered in Recent Activity. */
    label: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.from("audit_events").insert({
      firm_id: event.firmId,
      actor_user_id: event.actorUserId,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      action_type: event.actionType,
      metadata_json: { label: event.label, ...(event.metadata ?? {}) },
    });
  } catch (e) {
    console.error("Failed to record audit event:", e);
  }
}

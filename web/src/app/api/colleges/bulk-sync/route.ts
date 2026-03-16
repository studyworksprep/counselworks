import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/db/client";
import {
  searchScorecard,
  getScorecardById,
  scorecardToColumns,
} from "@/lib/scorecard/client";

const BATCH_SIZE = 5;
const DELAY_BETWEEN_COLLEGES_MS = 4000;

/**
 * POST /api/colleges/bulk-sync
 *
 * Processes a small batch of colleges per request. The client polls this
 * endpoint repeatedly until all colleges are synced. This avoids needing
 * Inngest or any background job infrastructure.
 *
 * Body: { mode: "unsynced" | "stale" | "all" }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const mode = body.mode as "unsynced" | "stale" | "all";

  if (!["unsynced", "stale", "all"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const db = createServerClient();

  // Fetch a batch of colleges that need syncing
  let query = db
    .from("colleges")
    .select("id, name, scorecard_id")
    .order("name")
    .limit(BATCH_SIZE);

  if (mode === "unsynced") {
    query = query.is("scorecard_synced_at", null);
  } else if (mode === "stale") {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    query = query.or(
      `scorecard_synced_at.is.null,scorecard_synced_at.lt.${thirtyDaysAgo}`
    );
  }
  // mode === "all": For re-sync all, we pick colleges with the oldest
  // scorecard_synced_at first (nulls first), so each batch makes progress.
  if (mode === "all") {
    query = db
      .from("colleges")
      .select("id, name, scorecard_id")
      .order("scorecard_synced_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);
  }

  const { data: colleges, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch colleges" },
      { status: 500 }
    );
  }

  if (!colleges || colleges.length === 0) {
    // Nothing left to sync — log completion
    await db.from("audit_events").insert({
      entity_type: "scorecard_sync",
      action_type: "sync_complete",
      metadata_json: {
        mode,
        synced: 0,
        failed: 0,
        total: 0,
        completedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ done: true, synced: 0, failed: 0, remaining: 0, errors: [] });
  }

  // Count total remaining (for progress display)
  let countQuery = db
    .from("colleges")
    .select("id", { count: "exact", head: true });

  if (mode === "unsynced") {
    countQuery = countQuery.is("scorecard_synced_at", null);
  } else if (mode === "stale") {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    countQuery = countQuery.or(
      `scorecard_synced_at.is.null,scorecard_synced_at.lt.${thirtyDaysAgo}`
    );
  }
  // For "all" mode, count colleges not synced in the last minute
  // (ones we haven't touched in this session)
  if (mode === "all") {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    countQuery = db
      .from("colleges")
      .select("id", { count: "exact", head: true })
      .or(`scorecard_synced_at.is.null,scorecard_synced_at.lt.${oneMinuteAgo}`);
  }

  const { count: remainingCount } = await countQuery;

  // Process the batch
  let synced = 0;
  let failed = 0;
  const errors: { name: string; error: string }[] = [];

  for (let i = 0; i < colleges.length; i++) {
    const college = colleges[i];
    try {
      let result;
      if (college.scorecard_id) {
        result = await getScorecardById(college.scorecard_id);
      } else {
        const results = await searchScorecard(college.name);
        result = results[0] ?? null;
      }

      if (!result) {
        // Mark as synced with null data so we don't retry endlessly
        await db
          .from("colleges")
          .update({ scorecard_synced_at: new Date().toISOString() })
          .eq("id", college.id);
        failed++;
        errors.push({ name: college.name, error: "No match found" });
        continue;
      }

      const columns = scorecardToColumns(result);
      const { error } = await db
        .from("colleges")
        .update(columns)
        .eq("id", college.id);

      if (error) {
        failed++;
        errors.push({ name: college.name, error: error.message });
      } else {
        synced++;
      }

      // Delay between requests to respect rate limit
      if (i < colleges.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_COLLEGES_MS));
      }
    } catch (e) {
      failed++;
      errors.push({
        name: college.name,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  const remaining = Math.max(0, (remainingCount ?? 0) - synced - failed);
  const done = remaining === 0;

  // Log progress
  await db.from("audit_events").insert({
    entity_type: "scorecard_sync",
    action_type: done ? "sync_complete" : "sync_progress",
    metadata_json: {
      mode,
      batchSynced: synced,
      batchFailed: failed,
      remaining,
      synced,
      failed,
      total: (remainingCount ?? 0),
      errors: errors.slice(0, 20),
      ...(done ? { completedAt: new Date().toISOString() } : {}),
    },
  });

  return NextResponse.json({ done, synced, failed, remaining, errors });
}

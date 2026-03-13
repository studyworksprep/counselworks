"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startBulkScorecardSync } from "@/lib/actions/colleges";

interface SyncStatus {
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function SyncClient({
  counts,
  lastSync,
}: {
  counts: { unsynced: number; total: number; stale: number };
  lastSync: SyncStatus | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSync(mode: "unsynced" | "stale" | "all") {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await startBulkScorecardSync(mode);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(
          `Bulk sync started (mode: ${mode}). The job will process colleges sequentially with a 4-second delay between each API call. Refresh this page to check progress.`
        );
      }
    });
  }

  const syncedCount = counts.total - counts.unsynced;
  const syncPercent =
    counts.total > 0 ? Math.round((syncedCount / counts.total) * 100) : 0;

  const isRunning =
    lastSync?.action === "sync_progress" &&
    (lastSync.metadata.synced as number) + (lastSync.metadata.failed as number) <
      (lastSync.metadata.total as number);

  return (
    <PageShell
      title="Scorecard Data Sync"
      description="Bulk import College Scorecard data for all colleges"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.refresh()}>
            Refresh Status
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/college-planning")}
          >
            Back to Planning
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {/* Stats overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{counts.total}</p>
            <p className="text-sm text-gray-500">Total Colleges</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-green-600">{syncedCount}</p>
            <p className="text-sm text-gray-500">Synced ({syncPercent}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-orange-600">
              {counts.unsynced}
            </p>
            <p className="text-sm text-gray-500">Never Synced</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-yellow-600">
              {counts.stale}
            </p>
            <p className="text-sm text-gray-500">Stale (30+ days)</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Sync Coverage
            </span>
            <span className="text-sm text-gray-500">{syncPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all"
              style={{ width: `${syncPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sync actions */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Start Bulk Sync
          </h2>
          <p className="text-sm text-gray-500">
            Each college takes ~4 seconds to sync (API rate limit: ~900/hour).
            The job runs in the background — you can close this page.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-1">
                Unsynced Only
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Sync {counts.unsynced} colleges that have never been synced.
                {counts.unsynced > 0 && (
                  <> Estimated time: ~{Math.ceil((counts.unsynced * 4) / 60)} minutes.</>
                )}
              </p>
              <Button
                onClick={() => handleSync("unsynced")}
                disabled={isPending || counts.unsynced === 0}
              >
                {isPending ? "Starting..." : "Sync Unsynced"}
              </Button>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-1">
                Stale + Unsynced
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Sync colleges not synced in 30+ days, plus never-synced ones.
                {counts.stale + counts.unsynced > 0 && (
                  <> Estimated: ~{Math.ceil(((counts.stale + counts.unsynced) * 4) / 60)} min.</>
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => handleSync("stale")}
                disabled={isPending || (counts.stale + counts.unsynced === 0)}
              >
                {isPending ? "Starting..." : "Sync Stale"}
              </Button>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-1">
                Re-sync All
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Re-sync all {counts.total} colleges with fresh data.
                {counts.total > 0 && (
                  <> Estimated: ~{Math.ceil((counts.total * 4) / 60)} minutes.</>
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => handleSync("all")}
                disabled={isPending || counts.total === 0}
              >
                {isPending ? "Starting..." : "Re-sync All"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last sync status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Last Sync Status
            </h2>
            {isRunning && <Badge variant="warning">In Progress</Badge>}
            {lastSync?.action === "sync_complete" && (
              <Badge variant="success">Complete</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!lastSync ? (
            <p className="text-sm text-gray-500">
              No sync has been run yet.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="text-sm font-medium">
                    {lastSync.action === "sync_complete"
                      ? "Completed"
                      : "In Progress"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Synced</p>
                  <p className="text-sm font-medium text-green-600">
                    {String(lastSync.metadata.synced ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Failed</p>
                  <p className="text-sm font-medium text-red-600">
                    {String(lastSync.metadata.failed ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total</p>
                  <p className="text-sm font-medium">
                    {String(lastSync.metadata.total ?? 0)}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Last updated:{" "}
                {new Date(lastSync.created_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>

              {/* Show errors if any */}
              {Array.isArray(lastSync.metadata.errors) &&
                lastSync.metadata.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Recent errors:
                    </p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {(lastSync.metadata.errors as { name: string; error: string }[]).map(
                        (err, i) => (
                          <li key={i}>
                            {err.name}: {err.error}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

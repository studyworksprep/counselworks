import { getUnsyncedCollegeCount, getBulkSyncStatus } from "@/lib/db/queries";
import { SyncClient } from "./sync-client";

export default async function CollegeSyncPage() {
  const [counts, lastSync] = await Promise.all([
    getUnsyncedCollegeCount(),
    getBulkSyncStatus(),
  ]);

  return <SyncClient counts={counts} lastSync={lastSync} />;
}

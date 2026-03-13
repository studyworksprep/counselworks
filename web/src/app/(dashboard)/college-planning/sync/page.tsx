import { getUnsyncedCollegeCount, getBulkSyncStatus } from "@/lib/actions/colleges";
import { SyncClient } from "./sync-client";

export default async function CollegeSyncPage() {
  const [counts, lastSync] = await Promise.all([
    getUnsyncedCollegeCount(),
    getBulkSyncStatus(),
  ]);

  return <SyncClient counts={counts} lastSync={lastSync} />;
}

import { SyncClient } from "./sync-client";

export default async function CollegeSyncPage() {
  // Temporarily skip data fetching to isolate the rendering issue
  const counts = { unsynced: 0, total: 0, stale: 0 };
  const lastSync = null;

  return <SyncClient counts={counts} lastSync={lastSync} />;
}

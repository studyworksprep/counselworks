// Inngest client re-export. The legacy enqueueJob bridge and JOB_TYPES map
// were deleted in fix-plan Phase 6: they had zero callers and mapped to
// events with no handlers. Producers call inngest.send() directly.
export { inngest } from "./inngest";

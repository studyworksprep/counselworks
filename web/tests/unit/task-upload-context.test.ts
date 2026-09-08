import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowedRequest: true, requestStatus: "requested", uploads: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/resolve", () => ({ resolveUserAndFirm: async () => ({ dbUserId: "student-user", firmId: "firm", role: "student" }), isStaffRole: () => false }));
vi.mock("@/lib/auth/task-access", () => ({
  requireTaskReadAccess: async () => ({ task: { student_id: "child", related_entity_type: "document_request", related_entity_id: "correct-request" } }),
  requireTaskResourceAccess: async () => { if (!state.allowedRequest) throw new Error("Denied"); return { status: state.requestStatus }; },
}));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ from: () => {
  const q = { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: { id: "child" }, error: null }) }; return q;
} }) }));
vi.mock("@/lib/storage", () => ({ uploadFile: async () => { state.uploads++; }, BUCKET_DOCUMENTS: "documents" }));
vi.mock("@/lib/db/queries", () => ({ getDocumentVersions: vi.fn() }));
vi.mock("@/lib/queue/inngest", () => ({ inngest: { send: vi.fn() } }));
import { uploadDocument } from "@/lib/actions/documents";
function form(requestId: string, taskId?: string) {
  const data = new FormData(); data.set("file", new File(["test"], "transcript.txt"));
  data.set("request_id", requestId); if (taskId) data.set("task_id", taskId); return data;
}
beforeEach(() => { state.allowedRequest = true; state.requestStatus = "requested"; state.uploads = 0; });
describe("request upload context", () => {
  it("rejects another student's request before uploading any bytes", async () => {
    state.allowedRequest = false;
    expect(await uploadDocument(form("foreign-request"))).toHaveProperty("error");
    expect(state.uploads).toBe(0);
  });
  it("rejects a request that differs from the linked task", async () => {
    expect(await uploadDocument(form("wrong-request", "task"))).toHaveProperty("error");
    expect(state.uploads).toBe(0);
  });
  it("does not upload against a closed request", async () => {
    state.requestStatus = "cancelled";
    expect(await uploadDocument(form("correct-request", "task"))).toHaveProperty("error");
    expect(state.uploads).toBe(0);
  });
});

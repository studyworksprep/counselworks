import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  workspace: vi.fn(),
  generate: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  writeAccess: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mock.refresh }));
vi.mock("@/lib/colleges/revalidate", () => ({
  revalidateCollegeWorkspaces: mock.refresh,
}));
vi.mock("@/lib/auth/resolve", () => ({ resolveUserAndFirm: mock.actor }));
vi.mock("@/lib/auth/essays", () => ({
  requireEssayWriteAccess: mock.writeAccess,
}));
vi.mock("@/lib/db/queries", () => ({
  getEssayCoachingWorkspace: mock.workspace,
}));
vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ from: mock.from, rpc: mock.rpc }),
}));
vi.mock("@/lib/ai/generate-essay-coaching", () => ({
  generateEssayCoaching: mock.generate,
}));
import { AuthorizationError } from "@/lib/auth/authorize";
import {
  publishEssayCoaching,
  requestEssayCoaching,
} from "@/lib/actions/essay-coaching";
const id = (n: number) =>
  `a6800000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = {
  kind: "bank",
  id: id(1),
  revision: 1,
  stamp: "a".repeat(32),
  label: "A choice",
  text: "SELECTED",
  entryKind: "story",
  questionKey: null,
};
const refs = [
  {
    kind: source.kind,
    id: source.id,
    revision: source.revision,
    stamp: source.stamp,
  },
];
const input = {
  essayId: id(2),
  versionId: id(3),
  taskStamp: "b".repeat(32),
  refs,
};
const workspace = {
  essayId: input.essayId,
  studentId: id(4),
  version: { id: input.versionId, number: 2, body: "SAVED STUDENT WRITING" },
  latestVersionNumber: 2,
  prompt: { text: "Describe a choice." },
  taskStamp: input.taskStamp,
  sources: [source, { ...source, id: id(9), text: "UNCHECKED" }],
  requests: [],
};
let writes: { table: string; patch: Record<string, unknown> }[],
  reservationError: string | null;
beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  reservationError = null;
  mock.actor.mockResolvedValue({
    firmId: id(5),
    dbUserId: id(6),
    role: "student",
  });
  mock.workspace.mockResolvedValue(workspace);
  mock.writeAccess.mockResolvedValue({});
  mock.rpc.mockResolvedValue({ data: id(8), error: null });
  mock.generate.mockResolvedValue({
    result: { assessment: "Explore the choice", suggestions: [], gaps: [] },
    model: "fixture",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  mock.from.mockImplementation((table: string) => {
    let patch: Record<string, unknown> = {};
    const q = {
      insert: (p: Record<string, unknown>) => {
        patch = p;
        writes.push({ table, patch: p });
        return q;
      },
      update: (p: Record<string, unknown>) => {
        patch = p;
        writes.push({ table, patch: p });
        return q;
      },
      eq: () => q,
      select: () => q,
      single: async () => ({
        data: reservationError ? null : { id: id(7) },
        error: reservationError ? { message: reservationError } : null,
      }),
      maybeSingle: async () => ({ data: { id: id(7) }, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: patch, error: null }).then(resolve),
    };
    return q;
  });
});
describe("saved-version coaching request boundary", () => {
  it("requires sign-in and authorized saved-version access before quota or provider", async () => {
    mock.actor.mockResolvedValueOnce(null);
    expect(await requestEssayCoaching(input)).toHaveProperty("error");
    mock.workspace.mockRejectedValueOnce(
      new AuthorizationError("Not assigned"),
    );
    expect(await requestEssayCoaching(input)).toEqual({
      error: "Not assigned",
    });
    expect(mock.generate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it("rejects stale prompts and source revisions before generation", async () => {
    mock.workspace.mockResolvedValueOnce({
      ...workspace,
      taskStamp: "c".repeat(32),
    });
    expect(await requestEssayCoaching(input)).toHaveProperty("error");
    expect(
      await requestEssayCoaching({
        ...input,
        refs: [{ ...refs[0], revision: 2 }],
      }),
    ).toHaveProperty("error");
    expect(mock.generate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it("does not invoke the provider when the shared quota is exhausted", async () => {
    reservationError = "AI request limit reached; please try again later";
    expect(await requestEssayCoaching(input)).toEqual({
      error: reservationError,
    });
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("refuses oversized or empty saved drafts without truncation or billing", async () => {
    for (const body of ["", "x".repeat(50001)]) {
      mock.workspace.mockResolvedValueOnce({
        ...workspace,
        version: { ...workspace.version, body },
      });
      expect(await requestEssayCoaching(input)).toHaveProperty("error");
    }
    expect(writes).toEqual([]);
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("sends only checked context with the explicitly chosen saved version", async () => {
    expect(await requestEssayCoaching(input)).toHaveProperty("data");
    expect(mock.generate).toHaveBeenCalledWith(workspace, [source]);
    expect(writes[0].patch).toMatchObject({
      version_id: input.versionId,
      source_refs: refs,
      task_stamp: input.taskStamp,
    });
    expect(writes.map((w) => w.table)).not.toContain("essay_drafts");
    expect(writes.map((w) => w.table)).not.toContain("essay_draft_versions");
  });
  it("does not substitute a newly saved version during an in-flight review", async () => {
    mock.workspace
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce({ ...workspace, latestVersionNumber: 3 })
      .mockResolvedValueOnce({ ...workspace, latestVersionNumber: 3 });
    expect(await requestEssayCoaching(input)).toHaveProperty("data");
    expect(writes.find((w) => w.patch.status === "ready")).toBeTruthy();
    expect(mock.generate.mock.calls[0][0].version.number).toBe(2);
  });
  it("suppresses output after in-flight source changes or loss of access", async () => {
    mock.workspace
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce({ ...workspace, sources: [] });
    expect(await requestEssayCoaching(input)).toHaveProperty("error");
    expect(writes.some((w) => w.patch.status === "ready")).toBe(false);
    expect(writes.at(-1)?.patch).toEqual({ status: "failed" });
  });
  it("records provider failure without logging or returning student text", async () => {
    mock.generate.mockRejectedValueOnce(new Error("PRIVATE PROVIDER BODY"));
    const result = await requestEssayCoaching(input);
    expect(JSON.stringify(result)).not.toContain("PRIVATE PROVIDER BODY");
    expect(writes.at(-1)?.patch.status).toBe("failed");
  });
});
describe("reviewed coaching publication", () => {
  function form() {
    const f = new FormData();
    Object.entries({
      essay_id: input.essayId,
      version_id: input.versionId,
      request_id: id(7),
      index: "0",
      body: "My reviewed question",
    }).forEach(([k, v]) => f.set(k, v));
    return f;
  }
  it("adds edited feedback through the atomic existing-thread path", async () => {
    mock.workspace.mockResolvedValueOnce({
      ...workspace,
      requests: [{ id: id(7), used: [], result: { suggestions: [{}] } }],
    });
    expect(await publishEssayCoaching(form())).toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith("publish_essay_coaching", {
      p_firm: id(5),
      p_actor: id(6),
      p_request: id(7),
      p_index: 0,
      p_body: "My reviewed question",
    });
    expect(writes).toEqual([]);
  });
  it("retains refused edits and blocks stale, reused or unauthorized promotion", async () => {
    expect(await publishEssayCoaching(form())).toHaveProperty("error");
    mock.workspace.mockResolvedValueOnce({
      ...workspace,
      requests: [{ id: id(7), used: [0], result: { suggestions: [{}] } }],
    });
    expect(await publishEssayCoaching(form())).toHaveProperty("error");
    mock.writeAccess.mockRejectedValueOnce(new AuthorizationError("Read only"));
    expect(await publishEssayCoaching(form())).toEqual({ error: "Read only" });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

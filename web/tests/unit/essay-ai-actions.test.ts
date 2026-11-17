import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  actor: vi.fn(),
  access: vi.fn(),
  workspace: vi.fn(),
  generate: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocked.refresh }));
vi.mock("@/lib/colleges/revalidate", () => ({
  revalidateCollegeWorkspaces: mocked.refresh,
}));
vi.mock("@/lib/auth/resolve", () => ({ resolveUserAndFirm: mocked.actor }));
vi.mock("@/lib/auth/essay-ai", () => ({ requireEssayAiAccess: mocked.access }));
vi.mock("@/lib/db/queries", () => ({ getEssayAiWorkspace: mocked.workspace }));
vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ from: mocked.from, rpc: mocked.rpc }),
}));
vi.mock("@/lib/ai/essay-assistance", () => ({
  generateEssayAssistance: mocked.generate,
}));
import { requestEssayAiAssistance } from "@/lib/actions/essay-ai";
const id = (n: number) =>
  `a6600000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = {
  kind: "bank",
  id: id(1),
  revision: 1,
  stamp: "a".repeat(32),
  label: "Repair",
  questionKey: null,
  entryKind: "story",
  text: "A fictional repair",
};
const input = {
  essayId: id(2),
  mode: "story_matches",
  taskStamp: "b".repeat(32),
  refs: [
    {
      kind: source.kind,
      id: source.id,
      revision: source.revision,
      stamp: source.stamp,
    },
  ],
};
const workspace = {
  drafting: {
    studentId: id(6),
    row: { promptText: "Describe a decision.", entryIds: [] },
  },
  sources: [source, { ...source, id: id(9), text: "UNSELECTED" }],
  taskStamp: input.taskStamp,
  requests: [],
};
let writes: { table: string; patch: unknown }[];
beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  mocked.actor.mockResolvedValue({
    firmId: id(4),
    dbUserId: id(3),
    role: "student",
  });
  mocked.access.mockResolvedValue(undefined);
  mocked.workspace.mockResolvedValue(workspace);
  mocked.generate.mockResolvedValue({
    result: { matches: [], gaps: ["Which real decision fits?"] },
    model: "test-model",
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  });
  mocked.from.mockImplementation((table: string) => {
    const result = { data: { id: id(5) }, error: null };
    const chain = {
      insert: (patch: unknown) => {
        writes.push({ table, patch });
        return chain;
      },
      update: (patch: unknown) => {
        writes.push({ table, patch });
        return chain;
      },
      select: () => chain,
      eq: () => chain,
      single: async () => result,
      maybeSingle: async () => result,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});
describe("essay AI action boundaries", () => {
  it("does not call the provider without authorization", async () => {
    mocked.actor.mockResolvedValueOnce(null);
    expect(await requestEssayAiAssistance(input)).toHaveProperty("error");
    expect(mocked.generate).not.toHaveBeenCalled();
    mocked.access.mockRejectedValueOnce(new Error("denied"));
    expect(await requestEssayAiAssistance(input)).toHaveProperty("error");
    expect(mocked.generate).not.toHaveBeenCalled();
  });
  it("rejects stale context and requirements before spending", async () => {
    expect(
      await requestEssayAiAssistance({
        ...input,
        refs: [{ ...input.refs[0], revision: 999 }],
      }),
    ).toHaveProperty("error");
    expect(
      await requestEssayAiAssistance({ ...input, taskStamp: "c".repeat(32) }),
    ).toHaveProperty("error");
    expect(mocked.from).not.toHaveBeenCalled();
    expect(mocked.generate).not.toHaveBeenCalled();
  });
  it("reserves quota before the provider and sends only selected sources", async () => {
    expect(await requestEssayAiAssistance(input)).toHaveProperty("data");
    expect(mocked.generate.mock.calls[0][2]).toEqual([source]);
    expect(writes[0].table).toBe("essay_ai_requests");
    expect(writes.some((w) => w.table === "ai_usage_events")).toBe(true);
    expect(
      writes.every((w) =>
        ["essay_ai_requests", "ai_usage_events"].includes(w.table),
      ),
    ).toBe(true);
  });
  it("suppresses text when a source is withdrawn in flight", async () => {
    mocked.workspace
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce({ ...workspace, sources: [] });
    expect(await requestEssayAiAssistance(input)).toHaveProperty("error");
    expect(
      writes.some((w) => JSON.stringify(w.patch).includes('"ready"')),
    ).toBe(false);
  });
  it("suppresses text when the prompt, plan or outline changes in flight", async () => {
    mocked.workspace
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce({ ...workspace, taskStamp: "c".repeat(32) });
    expect(await requestEssayAiAssistance(input)).toHaveProperty("error");
    expect(
      writes.some((w) => JSON.stringify(w.patch).includes('"ready"')),
    ).toBe(false);
  });
  it("rechecks assignment after generation", async () => {
    mocked.access
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("withdrawn"));
    expect(await requestEssayAiAssistance(input)).toHaveProperty("error");
    expect(
      writes.some((w) => JSON.stringify(w.patch).includes('"ready"')),
    ).toBe(false);
  });
  it("handles provider failures without returning provider bodies or writing documents", async () => {
    mocked.generate.mockRejectedValueOnce(new Error("SECRET provider text"));
    const result = await requestEssayAiAssistance(input);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(
      writes.some((w) => JSON.stringify(w.patch).includes('"failed"')),
    ).toBe(true);
  });
});

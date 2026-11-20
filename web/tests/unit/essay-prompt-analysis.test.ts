import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  actor: vi.fn(),
  access: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  client: vi.fn(),
  parse: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocked.refresh }));
vi.mock("@/lib/auth/resolve", () => ({
  resolveUserAndFirm: mocked.actor,
  isStaffRole: (role: string) =>
    ["firm_owner", "counselor", "read_only_partner"].includes(role),
}));
vi.mock("@/lib/auth/essays", () => ({
  requireEssayWriteAccess: mocked.access,
}));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ from: mocked.from }) }));
vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "test-model",
  getAnthropicClient: mocked.client,
  extractUsage: () => ({ input_tokens: 1, output_tokens: 1 }),
}));
import { analyzePromptForEssay } from "@/lib/actions/essays-ai";

const essayId = "a6600000-0000-4000-8000-000000000001";
const prompt = "Describe a decision that changed your next attempt.";
beforeEach(() => {
  vi.clearAllMocks();
  mocked.actor.mockResolvedValue({
    firmId: "firm",
    dbUserId: "staff",
    role: "counselor",
  });
  mocked.access.mockResolvedValue({ id: essayId });
  mocked.client.mockReturnValue({ messages: { parse: mocked.parse } });
  mocked.parse.mockResolvedValue({
    parsed_output: { prompt_type: "other", word_count_limit: null },
  });
  mocked.from.mockImplementation(() => {
    const q = {
      select: (columns: string) => {
        mocked.select(columns);
        return q;
      },
      eq: () => q,
      update: () => q,
      insert: async () => ({ error: null }),
      single: async () => ({ data: { id: essayId, prompt_text: prompt } }),
    };
    return q;
  });
});

describe("remaining prompt-only essay analysis", () => {
  it("requires sign-in before reading essay context or calling the provider", async () => {
    mocked.actor.mockResolvedValue(null);
    expect(await analyzePromptForEssay(essayId)).toHaveProperty("error");
    expect(mocked.from).not.toHaveBeenCalled();
    expect(mocked.client).not.toHaveBeenCalled();
  });
  it.each(["student", "parent_guardian"])(
    "denies direct %s requests",
    async (role) => {
      mocked.actor.mockResolvedValue({
        firmId: "firm",
        dbUserId: "portal",
        role,
      });
      expect(await analyzePromptForEssay(essayId)).toHaveProperty("error");
      expect(mocked.from).not.toHaveBeenCalled();
      expect(mocked.client).not.toHaveBeenCalled();
    },
  );
  it.each(["read_only_partner", "counselor"])(
    "checks centralized write access for %s",
    async (role) => {
      mocked.actor.mockResolvedValue({
        firmId: "firm",
        dbUserId: "staff",
        role,
      });
      mocked.access.mockRejectedValue(new Error("Editing unavailable"));
      expect(await analyzePromptForEssay(essayId)).toHaveProperty("error");
      expect(mocked.access).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role }),
        essayId,
      );
      expect(mocked.from).not.toHaveBeenCalled();
      expect(mocked.client).not.toHaveBeenCalled();
    },
  );
  it("sends only the assigned prompt and never loads a student profile", async () => {
    expect(await analyzePromptForEssay(essayId)).toHaveProperty("data");
    expect(mocked.select).toHaveBeenCalledWith("prompt_text");
    expect(mocked.parse.mock.calls[0][0].messages).toEqual([
      {
        role: "user",
        content:
          'Analyze this supplement essay prompt:\n\n"""\n' + prompt + '\n"""',
      },
    ]);
    expect(mocked.from.mock.calls.map(([table]) => table)).toEqual([
      "essay_drafts",
      "essay_drafts",
      "ai_usage_events",
    ]);
    expect(mocked.access.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.from.mock.invocationCallOrder[0],
    );
  });
});

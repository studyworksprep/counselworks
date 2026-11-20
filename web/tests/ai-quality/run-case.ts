import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { generateInterviewAssistance } from "../../src/lib/ai/interview-assistance";
import { generateEssayAssistance } from "../../src/lib/ai/essay-assistance";
import { generateEssayCoaching } from "../../src/lib/ai/generate-essay-coaching";
import { AI_MODEL } from "../../src/lib/ai/client";
import { selectStudentContext } from "../../src/lib/ai/student-context";
import { selectEssaySources } from "../../src/lib/ai/essay-context";
import { qualityCases, UNSELECTED_SENTINEL, type QualityCase } from "./cases";

type Capture = {
  request?: unknown;
  systemHash?: string;
  providerModel?: string;
  providerRequestId?: string | null;
  usage?: Record<string, number>;
  result?: unknown;
  httpStatus?: number;
};
export type QualityRecord = {
  id: string;
  title: string;
  kind: QualityCase["kind"];
  mode: string;
  expectations: string[];
  model: string;
  recordedAt: string;
  durationMs: number;
  contract: "accepted" | "rejected";
  unselectedContextExcluded: boolean;
  error?: { name: string; status?: number; validation?: string };
  capture: Capture;
};
const storage = new AsyncLocalStorage<Capture>();
let installed = false;

/** Observe actual provider traffic without replacing a request or response.
 * Headers and credentials are never recorded. Only synthetic case payloads and
 * successful structured model outputs enter the evidence record. */
function installCapture() {
  if (installed) return;
  const liveFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const trace = storage.getStore();
    if (!trace) return liveFetch(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin !== "https://api.anthropic.com" ||
      url.pathname !== "/v1/messages"
    ) {
      throw new Error(
        "Quality review permits only the established provider message endpoint",
      );
    }
    const text =
      typeof init?.body === "string"
        ? init.body
        : input instanceof Request
          ? await input.clone().text()
          : "";
    const body = JSON.parse(text) as { system?: unknown };
    trace.request = body;
    trace.systemHash = createHash("sha256")
      .update(JSON.stringify(body.system))
      .digest("hex");
    const response = await liveFetch(input, init);
    trace.httpStatus = response.status;
    if (response.ok) {
      const result = (await response.clone().json()) as {
        model: string;
        usage: Record<string, number>;
        content: { type: string; text?: string }[];
      };
      trace.providerModel = result.model;
      trace.providerRequestId = response.headers.get("request-id");
      trace.usage = result.usage;
      const output = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      try {
        trace.result = JSON.parse(output);
      } catch {
        trace.result = { unparsedText: output };
      }
    }
    return response;
  };
  installed = true;
}
export async function executeQualityCase(id: string): Promise<QualityRecord> {
  const testCase = qualityCases.find((c) => c.id === id);
  if (!testCase) throw new Error("Unknown predefined fictional review case");
  installCapture();
  const capture: Capture = {};
  const started = Date.now();
  const record: QualityRecord = {
    id,
    title: testCase.title,
    kind: testCase.kind,
    mode:
      testCase.kind === "coaching" ? "saved_version_coaching" : testCase.mode,
    expectations: testCase.expectations,
    model: AI_MODEL,
    recordedAt: new Date().toISOString(),
    durationMs: 0,
    contract: "rejected",
    unselectedContextExcluded: false,
    capture,
  };
  await storage.run(capture, async () => {
    try {
      if (testCase.kind === "interview") {
        const selected = selectStudentContext(
          testCase.context,
          testCase.mode,
          testCase.refs,
        );
        await generateInterviewAssistance(
          testCase.mode,
          testCase.context,
          selected,
          testCase.questions,
        );
      } else if (testCase.kind === "planning") {
        const selected = selectEssaySources(
          testCase.workspace.sources,
          testCase.refs,
        );
        await generateEssayAssistance(
          testCase.mode,
          testCase.workspace,
          selected,
        );
      } else {
        const selected = selectEssaySources(
          testCase.workspace.sources,
          testCase.refs,
        );
        await generateEssayCoaching(testCase.workspace, selected);
      }
      record.contract = "accepted";
    } catch (error) {
      const value = error as {
        name?: string;
        status?: number;
        message?: string;
      };
      // Local validation messages are useful evidence; provider bodies and
      // authentication/rate-limit messages are deliberately not copied.
      const local =
        value.name === "ZodError" ||
        /^(Unrecognized|Unsupported|Coaching quote|Unexpected|Missing|An AI proposal|Saved version)/.test(
          value.message ?? "",
        );
      record.error = {
        name: value.name ?? "Error",
        ...(typeof value.status === "number" ? { status: value.status } : {}),
        ...(local ? { validation: (value.message ?? "").slice(0, 1000) } : {}),
      };
    }
  });
  record.durationMs = Date.now() - started;
  const request = JSON.stringify(capture.request ?? null);
  record.unselectedContextExcluded =
    !!capture.request && !request.includes(UNSELECTED_SENTINEL);
  return record;
}

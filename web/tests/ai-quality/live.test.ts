import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { qualityCases } from "./cases";
import { executeQualityCase, type QualityRecord } from "./run-case";

// Never part of the ordinary unit suite or CI. A live run requires both an
// explicit flag and the existing provider credential in the process environment.
const live = process.env.CW_AI_LIVE_REVIEW === "1";
const records: QualityRecord[] = [];
let providerUnavailable = false;
describe.skipIf(!live)("actual-provider fictional quality review", () => {
  afterEach(() => {
    const directory = process.env.CW_AI_REVIEW_OUTPUT_DIR;
    if (!directory) return;
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "records.json"),
      JSON.stringify({ syntheticOnly: true, records }, null, 2) + "\n",
    );
  });
  test.for(qualityCases)("$id", async (testCase, context) => {
    if (providerUnavailable) return context.skip();
    expect(
      process.env.ANTHROPIC_API_KEY,
      "Supply the established provider key via the environment",
    ).toMatch(/^sk-ant-/);
    const record = await executeQualityCase(testCase.id);
    records.push(record);
    if ([400, 401, 403, 429].includes(record.error?.status ?? 0))
      providerUnavailable = true;
    expect(
      record.capture.providerModel,
      "A real provider response must be captured",
    ).toBeTruthy();
    expect(record.unselectedContextExcluded).toBe(true);
    expect(record.contract).toBe("accepted");
  });
});

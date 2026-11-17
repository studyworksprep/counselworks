import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Design guards (design refresh, phase 1). Pages and components must:
 * - show enum values through their label maps in lib/constants, never as
 *   the raw database token ("decision_received" rendered as "decision received");
 * - color status with the theme tokens (primary/success/warning/danger/gray)
 *   via the tone maps, never raw palette hues — categorical palettes such as
 *   meeting-type colors live beside their enum in lib/constants instead;
 * - keep body text at 4.5:1 or better (gray-400 on white is 2.5:1);
 * - draw icons as SVG, not text glyphs that render at font size and read
 *   oddly to screen readers.
 */

const SRC = path.resolve(__dirname, "../../src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

const FILES = [
  ...tsxFiles(path.join(SRC, "app")),
  ...tsxFiles(path.join(SRC, "components")),
];

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) {
          hits.push(
            `${path.relative(SRC, file)}:${index + 1}: ${line.trim().slice(0, 120)}`
          );
        }
      });
  }
  return hits;
}

const RAW_PALETTE =
  /\b(bg|text|border|ring|fill|stroke|from|to|via|outline|divide|accent|decoration)-(red|green|yellow|amber|blue|indigo|purple|violet|emerald|rose|orange|teal|sky|cyan|lime|pink|fuchsia)-\d{2,3}\b/;

describe("design guards", () => {
  it("scans the app and component trees", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("never renders a raw database token as a label", () => {
    expect(offenders(/\.replace\(\/_\/g/)).toEqual([]);
  });

  it("colors status with theme tokens, not raw palette hues", () => {
    expect(offenders(RAW_PALETTE)).toEqual([]);
  });

  it("keeps text off gray-400", () => {
    expect(offenders(/(^|["'`\s{])text-gray-400\b/)).toEqual([]);
  });

  it("draws icons as SVG instead of text glyphs", () => {
    expect(offenders(/[✓✕⚠‹›○]/)).toEqual([]);
  });
});

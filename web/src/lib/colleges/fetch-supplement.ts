import { parse } from "next/dist/compiled/node-html-parser";
import { importBostonCollegeSupplement } from "./prompt-import";
import { supplementSources, type SourceCheck } from "./prompt-sources";

export function enabledSupplementSources() {
  return (process.env.SUPPLEMENT_SOURCE_IDS ?? "").split(",").map(Number).filter(id => supplementSources[id]);
}

export function extractSupplement(html: string, id: number, year: number) {
  const root = parse(html);
  for (const element of root.querySelectorAll("script,style,nav,footer,template")) element.remove();
  for (const list of root.querySelectorAll("ol")) {
    list.querySelectorAll("li").forEach((item, index) => {
      if (!/^\d+[.)]\s/.test(item.text.trim())) item.insertAdjacentHTML("afterbegin", `${index + 1}. `);
    });
  }
  const lines = root.structuredText.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const cycle = `${year - 1}\\s*[-–—]\\s*(?:${year}|${String(year).slice(-2)})\\b`;
  const heading = id === 164924 ? `^Supplemental Questions\\s+${cycle}$`
    : id === 130794 ? `first.year applicants.*${cycle} essay topics` : `${cycle} application cycle`;
  const start = lines.findIndex(line => new RegExp(heading, "i").test(line));
  if (start < 0) throw new Error("The official page does not identify the requested application cycle.");
  const section = lines.slice(start);
  const endHeading = id === 164924 ? /^Standardized Testing$/i : id === 130794 ? /^(Essays: The Little Stuff|Learn more about first.year admission)/i : /^From Our Blog and Podcast$/i;
  const end = section.findIndex(line => endHeading.test(line));
  if (end < 1) throw new Error("The official page layout changed. Check the source manually.");
  let selected = section.slice(0, end);
  if (id === 186131) {
    // Some layouts render transfer content in a second tab in the same document.
    const academics = selected.findIndex(line => /^For A\.B\. Degree Applicants/i.test(line));
    if (academics < 0) throw new Error("Check the first-year section manually.");
    const transfer = selected.findIndex((line,index) => index > academics && /^Transfer Essay Questions$/i.test(line));
    if (transfer > 0) selected = selected.slice(0, transfer);
  }
  const text = selected.join("\n\n");
  if (text.length > 18000 || !text.includes("?")) throw new Error("Check the prompt section manually.");
  if (id === 164924) {
    const parsed = importBostonCollegeSupplement(text, year, []);
    if (parsed.error) throw new Error(parsed.error);
  }
  return text;
}

export async function checkSupplement(id: number, year: number): Promise<SourceCheck> {
  const checked_at = new Date().toISOString();
  try {
    if (!enabledSupplementSources().includes(id)) throw new Error("Automatic retrieval is awaiting source approval.");
    const response = await fetch(supplementSources[id], { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("The official page could not be retrieved.");
    const source_text = extractSupplement(await response.text(), id, year);
    return { checked_at, source_text, issue: "" };
  } catch (error) {
    return { checked_at, source_text: "", issue: error instanceof Error ? error.message : "Check the source manually." };
  }
}

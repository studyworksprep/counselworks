/**
 * Agreement-text markdown (fix plan 12.7 follow-up), pure and unit-tested in
 * tests/unit/agreements.test.ts.
 *
 * Templates are authored as light markdown (headings, bold, bullets, rules),
 * but the immutable body_snapshot is stored and hashed as the raw source —
 * rendering is presentation only and must never change the signed text.
 * This is a deliberately small, allowlisted subset parsed into a block
 * AST: no raw HTML, no links, no images, so nothing an author (or a
 * placeholder value) writes can inject markup into the signing page.
 * Anything unrecognised renders as a plain paragraph.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "bullets"; items: Inline[][] }
  | { type: "ordered"; items: Inline[][] }
  | { type: "hr" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/** Inline emphasis: **bold**, __bold__, *italic*, _italic_. */
export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  // Emphasis markers must sit at a word boundary: "snake_case_word" and
  // "5 * 3" are text, not italics.
  const re =
    /(?<![\w*_])(\*\*|__)(\S(?:.*?\S)?)\1(?![\w*_])|(?<![\w*_])(\*|_)([^*_\s](?:[^*_]*?[^*_\s])?)\3(?![\w*_])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", text: text.slice(last, start) });
    if (m[2] !== undefined) out.push({ type: "bold", text: m[2] });
    else out.push({ type: "italic", text: m[4] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

export function parseAgreementMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: Inline[][] = [];
  let list: { type: "bullets" | "ordered"; items: Inline[][] } | null = null;

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraph });
      paragraph = [];
    }
  }
  function flushList() {
    if (list) {
      blocks.push(list);
      list = null;
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, inlines: parseInlines(heading[2].trim()) });
      continue;
    }
    if (HR.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? "bullets" : "ordered";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(parseInlines((bullet ?? ordered)![1].trim()));
      continue;
    }
    flushList();
    paragraph.push(parseInlines(line.trim()));
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Inline run → plain text (markers dropped), for the PDF and plain email. */
export function inlinesToText(inlines: Inline[]): string {
  return inlines.map((i) => i.text).join("");
}

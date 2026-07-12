import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface SignatureLine {
  role: "firm" | "family";
  signedName: string;
  signerEmail: string;
  signedAt: string;
  ipAddress: string | null;
}

/**
 * Render the completed agreement as an immutable PDF (fix plan 10.1):
 * the exact signed text, both signature blocks, and the evidence footer
 * (document hash + signer identity/timestamp/IP audit trail).
 */
export async function renderSignedAgreementPdf(input: {
  title: string;
  firmName: string;
  body: string;
  documentHash: string;
  signatures: SignatureLine[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const pageWidth = 612; // US Letter
  const pageHeight = 792;
  const margin = 60;
  const maxWidth = pageWidth - margin * 2;
  const bodySize = 11;
  const lineHeight = 15;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function ensureRoom(needed: number) {
    if (y - needed < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  function wrap(text: string, size: number, f = font): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      if (paragraph.trim() === "") {
        lines.push("");
        continue;
      }
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (f.widthOfTextAtSize(candidate, size) > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      lines.push(current);
    }
    return lines;
  }

  function drawLines(lines: string[], size: number, f = font, color = rgb(0.1, 0.1, 0.12)) {
    for (const line of lines) {
      ensureRoom(lineHeight);
      if (line) page.drawText(line, { x: margin, y, size, font: f, color });
      y -= lineHeight;
    }
  }

  // Header
  drawLines(wrap(input.firmName, 12, bold), 12, bold, rgb(0.28, 0.27, 0.9));
  y -= 4;
  drawLines(wrap(input.title, 16, bold), 16, bold);
  y -= 8;

  // Body (the immutable snapshot both parties signed over)
  drawLines(wrap(input.body, bodySize), bodySize);
  y -= 20;

  // Signature blocks
  ensureRoom(90);
  drawLines(["Signatures"], 13, bold);
  y -= 2;
  for (const sig of input.signatures) {
    ensureRoom(70);
    page.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: margin + 220, y: y + 4 },
      thickness: 0.8,
      color: rgb(0.4, 0.4, 0.45),
    });
    y -= lineHeight;
    drawLines(
      [
        `${sig.signedName}  (${sig.role === "firm" ? "Firm representative" : "Parent / Guardian"})`,
      ],
      bodySize,
      bold
    );
    drawLines(
      [
        `Signed electronically ${sig.signedAt} · ${sig.signerEmail}` +
          (sig.ipAddress ? ` · IP ${sig.ipAddress}` : ""),
      ],
      9,
      italic,
      rgb(0.35, 0.35, 0.4)
    );
    y -= 8;
  }

  // Evidence footer
  ensureRoom(60);
  y -= 8;
  drawLines(
    wrap(
      `Electronic record. Both signers consented to transact electronically and signed by typing their legal name. Document integrity hash (SHA-256): ${input.documentHash}`,
      8,
      italic
    ),
    8,
    italic,
    rgb(0.45, 0.45, 0.5)
  );

  return doc.save();
}

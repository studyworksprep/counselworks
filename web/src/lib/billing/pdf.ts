import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { format, parseISO } from "date-fns";
import { formatCents } from "../agreements/schedule";

/**
 * Render an engagement invoice as an immutable PDF (fix plan 12.3),
 * following the signed-agreement PDF pattern (src/lib/agreements/pdf.ts).
 * Single page: firm header, invoice number and dates, billed-to family,
 * the installment line, and the amount due.
 */
export async function renderInvoicePdf(input: {
  firmName: string;
  invoiceNumber: string;
  familyName: string;
  agreementTitle: string;
  installmentLabel: string;
  amountCents: number;
  issuedOn: string; // YYYY-MM-DD
  dueOn: string; // YYYY-MM-DD
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612; // US Letter
  const pageHeight = 792;
  const margin = 60;
  const page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.4, 0.4, 0.45);
  const accent = rgb(0.28, 0.27, 0.9);

  function line(
    text: string,
    size: number,
    f = font,
    color = ink,
    gap = size + 6
  ) {
    page.drawText(text, { x: margin, y, size, font: f, color });
    y -= gap;
  }
  const day = (iso: string) => format(parseISO(iso), "MMMM d, yyyy");

  line(input.firmName, 13, bold, accent, 26);
  line("INVOICE", 22, bold, ink, 30);
  line(`Invoice number: ${input.invoiceNumber}`, 11, bold);
  line(`Issued: ${day(input.issuedOn)}`, 10, font, muted);
  line(`Due: ${day(input.dueOn)}`, 10, font, muted, 28);

  line("Billed to", 10, bold, muted, 16);
  line(input.familyName, 12, bold, ink, 20);
  line(`Under agreement: ${input.agreementTitle}`, 10, font, muted, 34);

  // The single line item, ruled above and below.
  page.drawLine({
    start: { x: margin, y: y + 10 },
    end: { x: pageWidth - margin, y: y + 10 },
    thickness: 0.8,
    color: muted,
  });
  page.drawText(input.installmentLabel, {
    x: margin,
    y: y - 8,
    size: 11,
    font,
    color: ink,
  });
  const amount = formatCents(input.amountCents);
  page.drawText(amount, {
    x: pageWidth - margin - bold.widthOfTextAtSize(amount, 11),
    y: y - 8,
    size: 11,
    font: bold,
    color: ink,
  });
  y -= 30;
  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: pageWidth - margin, y: y + 6 },
    thickness: 0.8,
    color: muted,
  });
  y -= 14;

  const total = `Amount due: ${amount}`;
  page.drawText(total, {
    x: pageWidth - margin - bold.widthOfTextAtSize(total, 13),
    y,
    size: 13,
    font: bold,
    color: ink,
  });
  y -= 40;

  line(
    "This invoice was generated from the executed service agreement and is",
    8,
    font,
    muted,
    12
  );
  line(
    "archived immutably in your family Documents.",
    8,
    font,
    muted
  );

  return doc.save();
}

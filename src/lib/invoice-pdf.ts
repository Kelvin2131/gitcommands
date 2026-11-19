import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatCents } from "@/lib/money";

export async function renderInvoicePdf(input: {
  number: string;
  clientName: string;
  clientCode: string;
  periodLabel: string;
  status: string;
  lines: { description: string; amountCents: number }[];
  totalCents: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.1, 0.08);
  const accent = rgb(0.6, 0.2, 0.07);
  let page = doc.addPage([612, 792]);
  let y = 750;

  const write = (text: string, size: number, face: typeof font, color = ink) => {
    page.drawText(text.slice(0, 90), { x: 48, y, size, font: face, color });
    y -= size + 8;
  };

  write("KAMO 3pl", 11, bold, accent);
  write("Cratekeep invoice", 22, bold);
  y -= 6;
  write(input.number, 14, bold);
  write(input.clientName, 12, font);
  write(`Client code ${input.clientCode}`, 11, font);
  write(input.periodLabel, 11, font);
  write(input.status, 11, font);
  y -= 8;

  for (const line of input.lines) {
    if (y < 90) {
      page = doc.addPage([612, 792]);
      y = 750;
    }
    page.drawText(line.description.slice(0, 78), { x: 48, y, size: 10, font, color: ink });
    const amount = formatCents(line.amountCents);
    const width = font.widthOfTextAtSize(amount, 10);
    page.drawText(amount, { x: 564 - width, y, size: 10, font, color: ink });
    y -= 18;
  }

  y -= 8;
  page.drawText("Total", { x: 48, y, size: 14, font: bold, color: ink });
  const total = formatCents(input.totalCents);
  const totalWidth = bold.widthOfTextAtSize(total, 14);
  page.drawText(total, { x: 564 - totalWidth, y, size: 14, font: bold, color: accent });
  return doc.save();
}

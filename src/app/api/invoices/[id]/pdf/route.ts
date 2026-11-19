import { NextResponse } from "next/server";
import { formatDay, getTimeZone } from "@/lib/dates";
import { db } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { labelStatus } from "@/lib/order-status";
import { requireApiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["OWNER"]);
  if (!user) return NextResponse.json({ error: "Only the owner can download invoices." }, { status: 401 });
  const { id } = await context.params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { client: true, lines: true },
  });
  if (!invoice) return NextResponse.json({ error: "That invoice is not on the desk." }, { status: 404 });
  const zone = getTimeZone();
  const pdf = await renderInvoicePdf({
    number: invoice.number,
    clientName: invoice.client.name,
    clientCode: invoice.client.code,
    periodLabel: `${formatDay(invoice.periodStart, zone)} to ${formatDay(new Date(invoice.periodEnd.getTime() - 1), zone)}`,
    status: labelStatus(invoice.status),
    lines: invoice.lines.map((line) => ({ description: line.description, amountCents: line.amountCents })),
    totalCents: invoice.totalCents,
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    },
  });
}

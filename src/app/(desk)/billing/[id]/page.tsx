import { notFound } from "next/navigation";
import { DeskForm } from "@/components/desk-form";
import { Notices, PageHeader, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDay, getTimeZone } from "@/lib/dates";
import { money } from "@/lib/format";
import { labelStatus } from "@/lib/order-status";
import { requireOwnerPage } from "@/lib/session";
import { deleteInvoiceAction, invoiceStatusAction } from "@/server/flow-actions";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireOwnerPage();
  const { id } = await params;
  const query = await searchParams;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { client: true, lines: { orderBy: { description: "asc" } } },
  });
  if (!invoice) notFound();
  const zone = getTimeZone();
  return (
    <>
      <PageHeader
        title={invoice.number}
        detail={`${invoice.client.name} · ${formatDay(invoice.periodStart, zone)} to ${formatDay(new Date(invoice.periodEnd.getTime() - 1), zone)}`}
        action={<Pill>{labelStatus(invoice.status)}</Pill>}
      />
      <Notices notice={query.notice} />
      <p className="text-sm text-stone-600">
        Storage {money(invoice.storageCents)} · pick and boxes {money(invoice.pickPackCents)} · labels {money(invoice.labelCents)}
      </p>
      {invoice.lines.length === 0 ? <p>Nothing to bill in this period.</p> : null}
      <ul className="grid gap-2">
        {invoice.lines.map((line) => (
          <li key={line.id} className="card flex justify-between gap-3 text-sm">
            <span>
              {line.description}
              {line.qty > 1 ? (
                <span className="block text-stone-600">
                  {line.qty} × {money(line.unitCents)}
                </span>
              ) : null}
            </span>
            <span className="font-semibold">{money(line.amountCents)}</span>
          </li>
        ))}
      </ul>
      <p className="text-2xl font-semibold">Total {money(invoice.totalCents)}</p>
      <div className="flex flex-wrap gap-3">
        <a className="btn-ghost" href={`/api/invoices/${invoice.id}/pdf`}>
          Download PDF
        </a>
        {invoice.status === "DRAFT" ? (
          <DeskForm action={invoiceStatusAction} submit="Issue">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="status" value="ISSUED" />
          </DeskForm>
        ) : null}
        {invoice.status === "ISSUED" ? (
          <DeskForm action={invoiceStatusAction} submit="Mark paid">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="status" value="PAID" />
          </DeskForm>
        ) : null}
        {invoice.status === "DRAFT" || invoice.status === "ISSUED" ? (
          <DeskForm action={invoiceStatusAction} submit="Void">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="status" value="VOID" />
          </DeskForm>
        ) : null}
        {invoice.status === "DRAFT" ? (
          <DeskForm action={deleteInvoiceAction} submit="Delete draft">
            <input type="hidden" name="invoiceId" value={invoice.id} />
          </DeskForm>
        ) : null}
      </div>
    </>
  );
}

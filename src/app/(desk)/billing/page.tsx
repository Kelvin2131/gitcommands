import Link from "next/link";
import { DeskForm } from "@/components/desk-form";
import { Empty, Field, Notices, PageHeader, Pill, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDay, getTimeZone, isoDay } from "@/lib/dates";
import { money } from "@/lib/format";
import { labelStatus } from "@/lib/order-status";
import { listClients } from "@/lib/queries";
import { requireOwnerPage } from "@/lib/session";
import { createInvoiceAction } from "@/server/flow-actions";

export const metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireOwnerPage();
  const query = await searchParams;
  const [invoices, clients] = await Promise.all([
    db.invoice.findMany({ include: { client: true }, orderBy: { createdAt: "desc" }, take: 40 }),
    listClients(),
  ]);
  const zone = getTimeZone();
  const today = isoDay(new Date(), zone);
  const monthStart = `${today.slice(0, 8)}01`;
  return (
    <>
      <PageHeader
        title="Billing"
        detail="Storage uses the stock on the shelf when you create the invoice. Pick, box fees, and labels use the amounts saved on the order."
      />
      <Notices notice={query.notice} />
      <DeskForm action={createInvoiceAction} submit="Create draft" className="card grid gap-3">
        <SelectField label="Client" name="clientId" required>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.code} · {client.name}
            </option>
          ))}
        </SelectField>
        <Field label="From" name="start" type="date" required defaultValue={monthStart} />
        <Field label="Through" name="end" type="date" required defaultValue={today} />
      </DeskForm>
      {invoices.length === 0 ? (
        <Empty title="No invoices yet" detail="Make a draft at the end of the month and read it before you send it." />
      ) : (
        <ul className="grid gap-2">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link href={`/billing/${invoice.id}`} className="card flex items-center justify-between gap-3">
                <span>
                  <span className="font-semibold">
                    {invoice.number} · {invoice.client.code}
                  </span>
                  <span className="block text-sm text-stone-600">
                    {formatDay(invoice.periodStart, zone)} – {formatDay(new Date(invoice.periodEnd.getTime() - 1), zone)} · {money(invoice.totalCents)}
                  </span>
                </span>
                <Pill>{labelStatus(invoice.status)}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

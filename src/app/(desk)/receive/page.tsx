import Link from "next/link";
import { DeskForm } from "@/components/desk-form";
import { Empty, Field, Notices, PageHeader, Pill, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { labelStatus } from "@/lib/order-status";
import { listClients } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { createInboundAction } from "@/server/flow-actions";

export const metadata = { title: "Receive" };

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireUser();
  const query = await searchParams;
  const [shipments, clients] = await Promise.all([
    db.inboundShipment.findMany({
      include: { client: true, lines: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    listClients(),
  ]);
  return (
    <>
      <PageHeader title="Receive" detail="Open the box, match it to a client, then scan each unit into a bin." />
      <Notices notice={query.notice} />
      <DeskForm action={createInboundAction} submit="Open shipment" className="card grid gap-3">
        <SelectField label="Client" name="clientId" required>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.code} · {client.name}
            </option>
          ))}
        </SelectField>
        <Field label="Reference" name="reference" required hint="PO number or carton id." />
        <Field label="Notes" name="notes" />
      </DeskForm>
      {shipments.length === 0 ? (
        <Empty title="No inbound shipments" detail="When a supplier carton arrives, open a shipment above." />
      ) : (
        <ul className="grid gap-2">
          {shipments.map((shipment) => {
            const expected = shipment.lines.reduce((sum, line) => sum + line.expectedQty, 0);
            const received = shipment.lines.reduce((sum, line) => sum + line.receivedQty, 0);
            return (
              <li key={shipment.id}>
                <Link href={`/receive/${shipment.id}`} className="card flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold">
                      {shipment.client.code} · {shipment.reference}
                    </span>
                    <span className="block text-sm text-stone-600">
                      Received {received}
                      {expected ? ` of ${expected} expected` : ""}
                    </span>
                  </span>
                  <Pill>{labelStatus(shipment.status)}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

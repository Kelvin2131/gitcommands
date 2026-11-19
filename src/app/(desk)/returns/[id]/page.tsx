import { notFound } from "next/navigation";
import { DeskForm } from "@/components/desk-form";
import { Field, Notices, PageHeader, Pill, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { labelStatus } from "@/lib/order-status";
import { listLocations } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { closeReturnAction, restockAction } from "@/server/flow-actions";

export default async function ReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const row = await db.return.findUnique({
    where: { id },
    include: { client: true, order: true, lines: { include: { product: true } } },
  });
  if (!row) notFound();
  const locations = await listLocations();
  return (
    <>
      <PageHeader
        title={row.order?.externalRef || "Return"}
        detail={`${row.client.name}. ${row.reason || "Put good units back on the shelf."}`}
        action={<Pill>{labelStatus(row.status)}</Pill>}
      />
      <Notices notice={query.notice} />
      <ul className="grid gap-3">
        {row.lines.map((line) => (
          <li key={line.id} className="card grid gap-3">
            <div className="flex justify-between gap-3">
              <span className="font-semibold">{line.product.sku}</span>
              <span>
                {line.restocked}/{line.qty} back
              </span>
            </div>
            {row.status === "OPEN" && line.restocked < line.qty ? (
              <DeskForm action={restockAction} submit="Restock" className="grid gap-3">
                <input type="hidden" name="returnId" value={row.id} />
                <input type="hidden" name="lineId" value={line.id} />
                <SelectField label="Bin" name="locationId" required>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code}
                    </option>
                  ))}
                </SelectField>
                <Field label="Quantity" name="qty" type="number" defaultValue={line.qty - line.restocked} required />
              </DeskForm>
            ) : null}
          </li>
        ))}
      </ul>
      {row.status === "OPEN" ? (
        <div className="flex flex-wrap gap-3">
          <DeskForm action={closeReturnAction} submit="All restocked">
            <input type="hidden" name="returnId" value={row.id} />
            <input type="hidden" name="mode" value="restocked" />
          </DeskForm>
          <DeskForm action={closeReturnAction} submit="Close without the rest">
            <input type="hidden" name="returnId" value={row.id} />
            <input type="hidden" name="mode" value="discarded" />
          </DeskForm>
        </div>
      ) : null}
    </>
  );
}

import { notFound } from "next/navigation";
import { CameraButton } from "@/components/camera";
import { DeskForm } from "@/components/desk-form";
import { Field, Notices, PageHeader, Pill, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { labelStatus } from "@/lib/order-status";
import { listLocations } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { closeInboundAction, expectLineAction } from "@/server/flow-actions";
import { receiveAction } from "@/server/stock-actions";

export default async function ReceiveDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const shipment = await db.inboundShipment.findUnique({
    where: { id },
    include: { client: true, lines: { include: { product: true } } },
  });
  if (!shipment) notFound();
  const locations = await listLocations();
  const receiving = locations.find((location) => location.kind === "RECEIVING")?.id;
  return (
    <>
      <PageHeader
        title={shipment.reference}
        detail={`${shipment.client.name}. Scan into the bin you are putting the units in.`}
        action={<Pill>{labelStatus(shipment.status)}</Pill>}
      />
      <Notices notice={query.notice} />
      <ul className="grid gap-2">
        {shipment.lines.map((line) => (
          <li key={line.id} className="card flex justify-between gap-3">
            <span>
              <span className="font-semibold">{line.product.sku}</span>
              <span className="block text-sm text-stone-600">{line.product.name}</span>
            </span>
            <span className="text-lg font-semibold">
              {line.receivedQty}
              <span className="text-sm font-normal text-stone-600"> / {line.expectedQty || "—"}</span>
            </span>
          </li>
        ))}
      </ul>
      {shipment.status !== "CLOSED" ? (
        <>
          <DeskForm action={receiveAction} submit="Receive" className="card grid gap-3">
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <input type="hidden" name="clientId" value={shipment.clientId} />
            <input type="hidden" name="back" value={`/receive/${shipment.id}`} />
            <SelectField label="Bin" name="locationId" required defaultValue={receiving}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </SelectField>
            <Field label="Quantity" name="qty" type="number" defaultValue={1} required />
            <Field id="recv-scan" label="Barcode or SKU" name="scan" required autoFocus className="scan-input font-mono" />
            <CameraButton inputId="recv-scan" />
          </DeskForm>
          <DeskForm action={expectLineAction} submit="Add expected SKU" className="card grid gap-3">
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <Field label="SKU" name="sku" required />
            <Field label="Expected quantity" name="qty" type="number" required />
          </DeskForm>
          <DeskForm action={closeInboundAction} submit="Close shipment">
            <input type="hidden" name="shipmentId" value={shipment.id} />
          </DeskForm>
        </>
      ) : (
        <p className="text-stone-600">This shipment is closed. New scans need a new reference.</p>
      )}
    </>
  );
}

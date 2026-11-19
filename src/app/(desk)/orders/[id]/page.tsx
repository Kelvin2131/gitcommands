import { notFound } from "next/navigation";
import { DeskForm } from "@/components/desk-form";
import { CameraButton } from "@/components/camera";
import { Field, Notices, PageHeader, Pill, SelectField } from "@/components/ui";
import { MAX_BOXES, trackingNumbersOf } from "@/lib/billing";
import { db } from "@/lib/db";
import { formatWhen, getTimeZone } from "@/lib/dates";
import { channelLabel, money } from "@/lib/format";
import { labelStatus } from "@/lib/order-status";
import { listLocations } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { packFeeInvoiceWhere } from "@/lib/warehouse";
import { cancelAction, packAction, pickAction, shipAction, trackingAction, unpackAction, updateBoxesAction } from "@/server/order-actions";
import { openReturnAction } from "@/server/flow-actions";

function boxWord(count: number): string {
  return count === 1 ? "box" : "boxes";
}

function TrackingFields({ count, values }: { count: number; values: string[] }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Field
          key={index}
          label={count === 1 ? "Tracking number" : `Box ${index + 1} tracking number`}
          name="trackingNumber"
          required={index === 0}
          autoFocus={index === 0}
          defaultValue={values[index] ?? ""}
          hint={
            count > 1 && index === 0
              ? "One number per box. Later boxes can be left blank and filled in after it ships."
              : undefined
          }
        />
      ))}
    </>
  );
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const order = await db.order.findUnique({
    where: { id },
    include: { client: true, lines: { include: { product: true } } },
  });
  if (!order) notFound();
  const invoiceWhere = packFeeInvoiceWhere(order);
  const [locations, lockingInvoice] = await Promise.all([
    listLocations(),
    invoiceWhere ? db.invoice.findFirst({ where: invoiceWhere, select: { id: true, number: true } }) : Promise.resolve(null),
  ]);
  const zone = getTimeZone();
  const ready = order.lines.every((line) => line.pickedQty === line.qty);
  const tracking = trackingNumbersOf(order.trackingNumbers, order.trackingNumber);
  const owner = user.role === "OWNER";
  const capturedRate =
    order.boxCount > 0 && order.packFeeCents % order.boxCount === 0 ? order.packFeeCents / order.boxCount : order.client.packFeeCents;
  const boxCountHint = owner
    ? `${money(capturedRate)} per box on this order · ${money(order.packFeeCents)} total. Change the count until the order is on an invoice.`
    : "How many boxes left the warehouse. You can change this until the order is on an invoice.";
  return (
    <>
      <PageHeader
        title={order.externalRef}
        detail={`${order.client.name} · ${channelLabel(order.channel)} · ${order.customerName || "No customer name"}`}
        action={<Pill>{labelStatus(order.status)}</Pill>}
      />
      <Notices notice={query.notice} error={query.error} />
      <p className="text-stone-700">
        {[order.shipLine1, order.shipCity, order.shipRegion, order.shipPostal, order.shipCountry].filter(Boolean).join(", ") || "No address yet."}
        {order.shipBy ? ` · Ship by ${formatWhen(order.shipBy, zone)}` : ""}
      </p>
      <ul className="grid gap-2">
        {order.lines.map((line) => (
          <li key={line.id} className="card flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold">{line.product.sku}</span>
              <span className="block text-sm text-stone-600">{line.product.name}</span>
            </span>
            <span className="text-lg font-semibold">
              {line.pickedQty}/{line.qty}
            </span>
          </li>
        ))}
      </ul>
      {order.status === "IMPORTED" || order.status === "PICKING" ? (
        <DeskForm action={pickAction} submit="Pick" className="card grid gap-3">
          <input type="hidden" name="orderId" value={order.id} />
          <SelectField label="Bin" name="locationId">
            <option value="">Use the fullest bin</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          <Field label="Quantity" name="qty" type="number" defaultValue={1} required />
          <Field id="order-scan" label="Scan the item" name="scan" required autoFocus className="scan-input font-mono" />
          <CameraButton inputId="order-scan" />
        </DeskForm>
      ) : null}
      {order.status === "PICKING" && ready ? (
        <DeskForm action={packAction} submit="Mark packed" className="card grid gap-3">
          <input type="hidden" name="orderId" value={order.id} />
          <Field
            label="Boxes"
            name="boxCount"
            type="number"
            min={1}
            max={MAX_BOXES}
            defaultValue={1}
            required
            hint={
              owner
                ? `${money(order.client.packFeeCents)} for each box. One order in two boxes is charged twice.`
                : "How many boxes this order ships in. The client is charged for each one."
            }
          />
        </DeskForm>
      ) : null}
      {order.status === "PACKED" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DeskForm action={shipAction} submit="Ship" className="card grid gap-3">
            <input type="hidden" name="orderId" value={order.id} />
            <TrackingFields count={order.boxCount} values={tracking} />
            <Field label="Carrier" name="carrier" required hint="UPS, USPS, FedEx…" />
            <Field label="Label vendor" name="labelVendor" required hint="Who you bought the label from." />
            <Field
              label={order.boxCount > 1 ? "What you paid for the labels" : "What you paid for the label"}
              name="labelCost"
              required
              hint={order.boxCount > 1 ? "Total for every label, in dollars, like 12.40." : "Dollars, like 6.12"}
            />
          </DeskForm>
          <div className="grid gap-4">
            <DeskForm action={updateBoxesAction} submit="Save boxes" className="card grid gap-3">
              <input type="hidden" name="orderId" value={order.id} />
              <Field label="Boxes" name="boxCount" type="number" min={1} max={MAX_BOXES} defaultValue={order.boxCount} required hint={boxCountHint} />
            </DeskForm>
            <DeskForm action={unpackAction} submit="Back to picking" className="card grid gap-3">
              <input type="hidden" name="orderId" value={order.id} />
              <p className="text-sm text-stone-600">Use this if you still need to pick something else. The box fee comes off the order.</p>
            </DeskForm>
          </div>
        </div>
      ) : null}
      {order.status === "SHIPPED" || order.status === "RETURNED" ? (
        <div className="card grid gap-1">
          <p>
            {order.carrier || "No carrier"}
            {tracking.length === 0 ? <span className="block">No tracking number yet.</span> : null}
            {tracking.map((number, index) => (
              <span key={`${number}-${index}`} className="block font-mono">
                {number}
              </span>
            ))}
          </p>
          <p>
            {order.boxCount} {boxWord(order.boxCount)}
            {tracking.length < order.boxCount
              ? ` · ${tracking.length} tracking ${tracking.length === 1 ? "number" : "numbers"}`
              : ""}
          </p>
          <p>
            Label from {order.labelVendor || "unknown"} · paid {money(order.labelCostCents)}
            {owner ? ` · billed ${money(order.labelBilledCents)}` : ""}
          </p>
          {owner ? (
            <p>
              Pick {money(order.pickFeeCents)} · box fee {money(order.packFeeCents)} ({order.boxCount} {boxWord(order.boxCount)})
            </p>
          ) : null}
          {order.shippedAt ? <p className="text-sm text-stone-600">Shipped {formatWhen(order.shippedAt, zone)}</p> : null}
          {lockingInvoice ? (
            <p className="text-sm text-stone-600">Box count is locked because this order is on invoice {lockingInvoice.number}.</p>
          ) : null}
        </div>
      ) : null}
      {order.status === "SHIPPED" || order.status === "RETURNED" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {lockingInvoice ? null : (
            <DeskForm action={updateBoxesAction} submit="Save boxes" className="card grid gap-3">
              <input type="hidden" name="orderId" value={order.id} />
              <Field label="Boxes" name="boxCount" type="number" min={1} max={MAX_BOXES} defaultValue={order.boxCount} required hint={boxCountHint} />
            </DeskForm>
          )}
          <DeskForm action={trackingAction} submit="Save tracking" className="card grid gap-3">
            <input type="hidden" name="orderId" value={order.id} />
            <TrackingFields count={order.boxCount} values={tracking} />
          </DeskForm>
        </div>
      ) : null}
      {order.status === "SHIPPED" ? (
        <DeskForm action={openReturnAction} submit="Start a return" className="card grid gap-3">
          <input type="hidden" name="orderId" value={order.id} />
          <Field label="Why it came back" name="reason" />
        </DeskForm>
      ) : null}
      {order.status === "IMPORTED" || order.status === "PICKING" || order.status === "PACKED" ? (
        <DeskForm action={cancelAction} submit="Cancel order" className="card grid gap-3">
          <input type="hidden" name="orderId" value={order.id} />
          <SelectField label="Put picked items back in" name="locationId">
            <option value="">Not picked yet</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          {order.status === "PACKED" ? (
            <p className="text-sm text-stone-600">Cancelling removes the pick fee and the box fee, so this order is not invoiced.</p>
          ) : null}
        </DeskForm>
      ) : null}
    </>
  );
}

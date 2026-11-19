import { notFound } from "next/navigation";
import { DeskForm } from "@/components/desk-form";
import { CameraButton } from "@/components/camera";
import { Field, Notices, PageHeader, Pill, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { formatWhen, getTimeZone } from "@/lib/dates";
import { channelLabel, money } from "@/lib/format";
import { labelStatus } from "@/lib/order-status";
import { listLocations } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { cancelAction, packAction, pickAction, shipAction, unpackAction } from "@/server/order-actions";
import { openReturnAction } from "@/server/flow-actions";

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
  const locations = await listLocations();
  const zone = getTimeZone();
  const ready = order.lines.every((line) => line.pickedQty === line.qty);
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
        <DeskForm action={packAction} submit="Mark packed">
          <input type="hidden" name="orderId" value={order.id} />
        </DeskForm>
      ) : null}
      {order.status === "PACKED" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DeskForm action={shipAction} submit="Ship" className="card grid gap-3">
            <input type="hidden" name="orderId" value={order.id} />
            <Field label="Tracking number" name="trackingNumber" required autoFocus />
            <Field label="Carrier" name="carrier" required hint="UPS, USPS, FedEx…" />
            <Field label="Label vendor" name="labelVendor" required hint="Who you bought the label from." />
            <Field label="What you paid for the label" name="labelCost" required hint="Dollars, like 6.12" />
          </DeskForm>
          <DeskForm action={unpackAction} submit="Back to picking" className="card grid gap-3">
            <input type="hidden" name="orderId" value={order.id} />
            <p className="text-sm text-stone-600">Use this if you still need to pick something else.</p>
          </DeskForm>
        </div>
      ) : null}
      {order.status === "SHIPPED" || order.status === "RETURNED" ? (
        <div className="card grid gap-1">
          <p>
            {order.carrier} {order.trackingNumber}
          </p>
          <p>
            Label from {order.labelVendor || "unknown"} · paid {money(order.labelCostCents)}
            {user.role === "OWNER" ? ` · billed ${money(order.labelBilledCents)}` : ""}
          </p>
          {user.role === "OWNER" ? (
            <p>
              Pick {money(order.pickFeeCents)} · pack {money(order.packFeeCents)}
            </p>
          ) : null}
          {order.shippedAt ? <p className="text-sm text-stone-600">Shipped {formatWhen(order.shippedAt, zone)}</p> : null}
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
        </DeskForm>
      ) : null}
    </>
  );
}

import Link from "next/link";
import { CameraButton } from "@/components/camera";
import { DeskForm } from "@/components/desk-form";
import { Field, Notices, PageHeader, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { listClients, listLocations } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { pickAction } from "@/server/order-actions";
import { countScanAction, receiveAction } from "@/server/stock-actions";

const modes = [
  ["receive", "Receive"],
  ["pick", "Pick"],
  ["count", "Count"],
  ["lookup", "Lookup"],
] as const;

export const metadata = { title: "Scan" };

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; notice?: string; error?: string; q?: string; clientId?: string; shipment?: string }>;
}) {
  await requireUser();
  const query = await searchParams;
  const mode = modes.some(([key]) => key === query.mode) ? query.mode! : "pick";
  const [clients, locations, orders] = await Promise.all([
    listClients(),
    listLocations(),
    db.order.findMany({
      where: { status: { in: ["IMPORTED", "PICKING"] } },
      include: { client: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  const matches =
    mode === "lookup" && query.q
      ? await db.product.findMany({
          where: {
            active: true,
            OR: [
              { barcode: query.q.trim() },
              { sku: { contains: query.q.trim(), mode: "insensitive" } },
              { name: { contains: query.q.trim(), mode: "insensitive" } },
            ],
          },
          include: { client: true, balances: true },
          take: 12,
        })
      : [];

  return (
    <>
      <PageHeader title="Scan" detail="A bluetooth scanner can type into the box and press Enter. On a phone, use the camera." />
      <Notices notice={query.notice} error={query.error} />
      <div className="flex flex-wrap gap-2">
        {modes.map(([key, label]) => (
          <Link key={key} href={`/scan?mode=${key}`} className={mode === key ? "btn" : "btn-ghost"} aria-current={mode === key ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </div>
      {mode === "receive" ? (
        <DeskForm action={receiveAction} submit="Receive" className="card grid gap-3">
          <input type="hidden" name="back" value="/scan?mode=receive" />
          {query.shipment ? <input type="hidden" name="shipmentId" value={query.shipment} /> : null}
          <SelectField label="Client" name="clientId" defaultValue={query.clientId}>
            <option value="">Any, if the barcode is unique</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} · {client.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Bin" name="locationId" required defaultValue={locations.find((location) => location.kind === "RECEIVING")?.id}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} · {location.name}
              </option>
            ))}
          </SelectField>
          <Field label="Quantity" name="qty" type="number" defaultValue={1} required />
          <Field id="scan-receive" label="Barcode or SKU" name="scan" required autoFocus className="scan-input font-mono" />
          <CameraButton inputId="scan-receive" />
        </DeskForm>
      ) : null}
      {mode === "pick" ? (
        <DeskForm action={pickAction} submit="Pick" className="card grid gap-3">
          <SelectField label="Order" name="orderId" required>
            <option value="">Choose</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.client.code} · {order.externalRef}
              </option>
            ))}
          </SelectField>
          <SelectField label="Bin (optional)" name="locationId">
            <option value="">Use the fullest bin</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          <Field label="Quantity" name="qty" type="number" defaultValue={1} required />
          <Field id="scan-pick" label="Barcode or SKU" name="scan" required autoFocus className="scan-input font-mono" />
          <CameraButton inputId="scan-pick" />
        </DeskForm>
      ) : null}
      {mode === "count" ? (
        <DeskForm action={countScanAction} submit="Save count" className="card grid gap-3">
          <SelectField label="Client" name="clientId">
            <option value="">Any, if the barcode is unique</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code}
              </option>
            ))}
          </SelectField>
          <SelectField label="Bin" name="locationId" required>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          <Field label="Counted quantity" name="counted" type="number" required defaultValue={0} />
          <Field id="scan-count" label="Barcode or SKU" name="scan" required autoFocus className="scan-input font-mono" />
          <CameraButton inputId="scan-count" />
        </DeskForm>
      ) : null}
      {mode === "lookup" ? (
        <div className="grid gap-3">
          <form action="/scan" className="card grid gap-3">
            <input type="hidden" name="mode" value="lookup" />
            <Field id="scan-lookup" label="Barcode, SKU, or name" name="q" defaultValue={query.q} required autoFocus className="scan-input font-mono" />
            <CameraButton inputId="scan-lookup" />
            <button className="btn" type="submit">
              Find
            </button>
          </form>
          <ul className="grid gap-2">
            {query.q && matches.length === 0 ? <li className="card">Nothing matches {query.q}.</li> : null}
            {matches.map((product) => {
              const onHand = product.balances.reduce((sum, balance) => sum + balance.qty, 0);
              return (
                <li key={product.id}>
                  <Link href={`/products/${product.id}`} className="card block">
                    <span className="font-semibold">
                      {product.client.code} · {product.sku}
                    </span>
                    <span className="block text-sm text-stone-600">
                      {product.name} · {onHand} on hand
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}

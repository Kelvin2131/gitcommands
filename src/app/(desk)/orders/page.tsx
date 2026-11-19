import Link from "next/link";
import { DeskForm } from "@/components/desk-form";
import { Empty, Field, Notices, PageHeader, Pill, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { channelLabel } from "@/lib/format";
import { labelStatus } from "@/lib/order-status";
import { listClients } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { createOrderAction } from "@/server/order-actions";

export const metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string; status?: string }>;
}) {
  await requireUser();
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const orders = await db.order.findMany({
    where: {
      ...(query.status ? { status: query.status as never } : {}),
      ...(q
        ? {
            OR: [
              { externalRef: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              { trackingNumber: { contains: q, mode: "insensitive" } },
              { trackingNumbers: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { client: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const [clients, products] = await Promise.all([
    listClients(),
    db.product.findMany({ where: { active: true }, include: { client: true }, orderBy: { sku: "asc" }, take: 300 }),
  ]);
  return (
    <>
      <PageHeader
        title="Orders"
        detail="Import a spreadsheet, or add one order here. Then scan to pick."
        action={
          <Link href="/import" className="btn-ghost">
            Import CSV
          </Link>
        }
      />
      <Notices notice={query.notice} />
      <form className="flex flex-wrap gap-2" action="/orders">
        <input name="q" defaultValue={q} placeholder="Order, name, or tracking" className="input max-w-sm" aria-label="Search orders" />
        <select name="status" defaultValue={query.status ?? ""} className="input max-w-48" aria-label="Status">
          <option value="">All statuses</option>
          {["IMPORTED", "PICKING", "PACKED", "SHIPPED", "CANCELLED", "RETURNED"].map((status) => (
            <option key={status} value={status}>
              {labelStatus(status)}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      {orders.length === 0 ? (
        <Empty title="No orders yet" detail="When a Temu or Walmart order comes in, import it or add it below." />
      ) : (
        <ul className="grid gap-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/orders/${order.id}`} className="card flex items-center justify-between gap-3">
                <span>
                  <span className="font-semibold">{order.externalRef}</span>
                  <span className="block text-sm text-stone-600">
                    {order.client.code} · {channelLabel(order.channel)} · {order.customerName || "No name"} · {order.lines.reduce((sum, line) => sum + line.qty, 0)} units
                    {order.status === "PACKED" || order.status === "SHIPPED" || order.status === "RETURNED"
                      ? ` · ${order.boxCount} ${order.boxCount === 1 ? "box" : "boxes"}`
                      : ""}
                  </span>
                </span>
                <Pill>{labelStatus(order.status)}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <details className="card">
        <summary className="cursor-pointer text-lg font-semibold">Add one order</summary>
        <DeskForm action={createOrderAction} submit="Add order" className="mt-3 grid gap-3">
          <SelectField label="Client" name="clientId" required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} · {client.name}
              </option>
            ))}
          </SelectField>
          <Field label="Order number" name="externalRef" required />
          <SelectField label="Channel" name="channel" defaultValue="TEMU">
            <option value="TEMU">Temu</option>
            <option value="WALMART">Walmart</option>
            <option value="OTHER">Other</option>
          </SelectField>
          <Field label="Customer" name="customerName" />
          <Field label="Street" name="shipLine1" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City" name="shipCity" />
            <Field label="State" name="shipRegion" />
            <Field label="Postal" name="shipPostal" />
          </div>
          <Field label="Ship by" name="shipBy" type="date" />
          <SelectField label="Product" name="productId" required>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.client.code} · {product.sku}
              </option>
            ))}
          </SelectField>
          <Field label="Quantity" name="qty" type="number" defaultValue={1} required />
          <p className="text-sm text-stone-600">For more than one SKU, import a CSV. Each extra row with the same order number is another line.</p>
        </DeskForm>
      </details>
    </>
  );
}

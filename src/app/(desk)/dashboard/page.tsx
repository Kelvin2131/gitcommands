import Link from "next/link";
import { Empty, Notices, PageHeader, Pill, Stat } from "@/components/ui";
import { formatDay, getTimeZone } from "@/lib/dates";
import { money } from "@/lib/format";
import { labelStatus } from "@/lib/order-status";
import { dashboardData } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Today" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const data = await dashboardData();
  const owner = user.role === "OWNER";
  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} detail="What needs to leave the building, and what is running low." />
      <Notices notice={query.notice} error={query.error} />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="To ship today" value={String(data.dueCount)} detail="Open orders due today or overdue" />
        <Stat label="Low stock" value={String(data.low.length)} detail="At or under the reorder point" />
        {owner ? <Stat label="Stock value" value={money(data.stockValueCents)} detail="On-hand quantity times cost" /> : null}
        {owner ? <Stat label="Label spend" value={money(data.labelSpendCents)} detail="This month, what you paid vendors" /> : null}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold">Ship list</h2>
          {data.dueOrders.length === 0 ? (
            <Empty title="Nothing waiting" detail="Imported orders that are due today will show up here." href="/orders" label="See orders" />
          ) : (
            <ul className="grid gap-2">
              {data.dueOrders.map((order) => {
                const units = order.lines.reduce((sum, line) => sum + line.qty, 0);
                const picked = order.lines.reduce((sum, line) => sum + line.pickedQty, 0);
                return (
                  <li key={order.id}>
                    <Link href={`/orders/${order.id}`} className="card flex items-center justify-between gap-3">
                      <span>
                        <span className="block font-semibold">{order.externalRef}</span>
                        <span className="text-sm text-stone-600">
                          {order.client.code} · {order.customerName || "No name"} · {picked}/{units} picked
                          {order.status === "PACKED" ? ` · ${order.boxCount} ${order.boxCount === 1 ? "box" : "boxes"}` : ""}
                        </span>
                      </span>
                      <Pill>{labelStatus(order.status)}</Pill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold">Restock</h2>
          {data.low.length === 0 ? (
            <Empty title="Stock is above the lines you set" detail="Set a reorder point on a product to watch it." href="/products" label="Products" />
          ) : (
            <ul className="grid gap-2">
              {data.low.map((item) => (
                <li key={item.id} className="card">
                  <Link href={`/products/${item.id}`} className="font-semibold">
                    {item.clientCode} · {item.sku}
                  </Link>
                  <p className="text-sm text-stone-700">
                    {item.name}. {item.onHand} on hand. Buy about {item.suggest}. {item.bins || "No bin"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      {owner ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h2 className="text-xl font-semibold">Profit this month</h2>
            <p className="text-sm text-stone-600">Pick fees, box fees, and label markup. Storage is billed when you make an invoice.</p>
            <ul className="mt-3 grid gap-2">
              {data.profit.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span>{row.name}</span>
                  <span className="font-semibold">{money(row.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="text-xl font-semibold">Labels by vendor</h2>
            <p className="text-sm text-stone-600">Month of {formatDay(new Date(), getTimeZone())}.</p>
            {data.labels.length === 0 ? <p className="mt-3 text-stone-600">No labels recorded yet.</p> : null}
            <ul className="mt-3 grid gap-2">
              {data.labels.map((row) => (
                <li key={row.vendor} className="flex justify-between gap-3">
                  <span>{row.vendor}</span>
                  <span className="font-semibold">{money(row.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

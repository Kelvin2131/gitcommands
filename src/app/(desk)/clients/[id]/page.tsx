import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/client-form";
import { Notices, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const client = await db.client.findUnique({
    where: { id },
    include: {
      products: { where: { active: true }, orderBy: { sku: "asc" }, take: 30 },
      orders: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
  if (!client) notFound();
  const stock = await db.$queryRaw<{ value: bigint; qty: number }[]>`
    SELECT COALESCE(SUM(b.qty * p."costCents"), 0)::bigint AS value,
           COALESCE(SUM(b.qty), 0)::int AS qty
    FROM "Product" p
    LEFT JOIN "InventoryBalance" b ON b."productId" = p.id
    WHERE p."clientId" = ${client.id}
  `;
  const value = Number(stock[0]?.value ?? 0);
  const qty = Number(stock[0]?.qty ?? 0);
  return (
    <>
      <PageHeader title={`${client.code} · ${client.name}`} detail={`${qty} units on hand${user.role === "OWNER" ? ` · ${money(value)} at cost` : ""}.`} />
      <Notices notice={query.notice} />
      <section>
        <h2 className="mb-2 text-xl font-semibold">Products</h2>
        <ul className="grid gap-2">
          {client.products.map((product) => (
            <li key={product.id}>
              <Link href={`/products/${product.id}`} className="font-semibold">
                {product.sku}
              </Link>
              <span className="text-stone-600"> · {product.name}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-semibold">Recent orders</h2>
        <ul className="grid gap-2">
          {client.orders.map((order) => (
            <li key={order.id}>
              <Link href={`/orders/${order.id}`}>{order.externalRef}</Link>
              <span className="text-stone-600"> · {order.status}</span>
            </li>
          ))}
        </ul>
      </section>
      {user.role === "OWNER" ? <ClientForm client={client} /> : null}
    </>
  );
}

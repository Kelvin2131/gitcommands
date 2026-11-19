import Link from "next/link";
import { DeskForm } from "@/components/desk-form";
import { Empty, Field, Notices, PageHeader, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { restockSuggestion } from "@/lib/inventory";
import { listLocations } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { saveLocationAction } from "@/server/catalog-actions";

export const metadata = { title: "Stock" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string; low?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const products = await db.product.findMany({
    where: {
      active: true,
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q } },
            ],
          }
        : {}),
    },
    include: { client: true, balances: { include: { location: true } } },
    orderBy: [{ client: { code: "asc" } }, { sku: "asc" }],
    take: 200,
  });
  const rows = products
    .map((product) => {
      const onHand = product.balances.reduce((sum, balance) => sum + balance.qty, 0);
      const suggestion = restockSuggestion(onHand, product.reorderPoint, product.reorderQty);
      return { product, onHand, suggestion };
    })
    .filter((row) => (query.low === "1" ? row.suggestion : true));
  const locations = user.role === "OWNER" ? await listLocations() : [];
  return (
    <>
      <PageHeader
        title="Stock"
        detail="Every quantity lives in a bin. Open a product to count, adjust, or move it."
        action={
          <Link href="/inventory?low=1" className="btn-ghost">
            Low only
          </Link>
        }
      />
      <Notices notice={query.notice} />
      <form action="/inventory" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="SKU, name, or barcode" aria-label="Search stock" className="input max-w-sm" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      {rows.length === 0 ? (
        <Empty title="No stock matches" detail="Receive a shipment or import an opening stock file." href="/receive" label="Receive" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-600">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">On hand</th>
                <th className="px-3 py-2 font-medium">Bins</th>
                <th className="px-3 py-2 font-medium">Buy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, onHand, suggestion }) => (
                <tr key={product.id} className="border-t border-line">
                  <td className="px-3 py-3">
                    <Link href={`/products/${product.id}`} className="font-semibold">
                      {product.client.code} · {product.sku}
                    </Link>
                    <span className="block text-stone-600">{product.name}</span>
                  </td>
                  <td className="px-3 py-3 text-lg font-semibold">{onHand}</td>
                  <td className="px-3 py-3">
                    {product.balances
                      .filter((balance) => balance.qty !== 0)
                      .map((balance) => `${balance.location.code}:${balance.qty}`)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-3 py-3">{suggestion ? suggestion.suggest : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {user.role === "OWNER" ? (
        <details className="card">
          <summary className="cursor-pointer text-lg font-semibold">Add a bin</summary>
          <DeskForm action={saveLocationAction} submit="Add bin" className="mt-3 grid gap-3">
            <Field label="Code" name="code" required hint="Like A-03" />
            <Field label="Name" name="name" required />
            <SelectField label="Kind" name="kind" defaultValue="STORAGE">
              <option value="RECEIVING">Receiving</option>
              <option value="STORAGE">Storage</option>
              <option value="PACK">Pack</option>
              <option value="SHIP">Ship</option>
            </SelectField>
            <p className="text-sm text-stone-600">{locations.length} bins on the floor now.</p>
          </DeskForm>
        </details>
      ) : null}
    </>
  );
}

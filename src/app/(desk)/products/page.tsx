import Link from "next/link";
import { Empty, Notices, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ notice?: string; q?: string }> }) {
  await requireUser();
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const products = await db.product.findMany({
    where: q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q } },
          ],
        }
      : {},
    include: { client: true },
    orderBy: [{ client: { code: "asc" } }, { sku: "asc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader
        title="Products"
        detail="Each client has their own SKUs. The same barcode is never applied to the wrong account."
        action={
          <Link href="/products/new" className="btn">
            Add product
          </Link>
        }
      />
      <Notices notice={query.notice} />
      <form action="/products" className="flex gap-2">
        <input name="q" defaultValue={q} aria-label="Search products" placeholder="SKU, name, or barcode" className="input max-w-sm" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      {products.length === 0 ? (
        <Empty title="No products yet" detail="Add the first SKU, or import a spreadsheet." href="/import" label="Import" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {products.map((product) => (
            <li key={product.id}>
              <Link href={`/products/${product.id}`} className="card flex gap-3">
                {product.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-lg bg-stone-200 text-xs">No photo</span>
                )}
                <span>
                  <span className="font-semibold">
                    {product.client.code} · {product.sku}
                  </span>
                  <span className="block text-sm text-stone-600">{product.name}</span>
                  {product.photoOk ? null : <span className="text-sm text-warn">Photo link looks broken</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

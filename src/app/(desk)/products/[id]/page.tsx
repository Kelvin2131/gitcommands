import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { DeskForm } from "@/components/desk-form";
import { Field, Notices, PageHeader, SelectField } from "@/components/ui";
import { db } from "@/lib/db";
import { formatWhen, getTimeZone } from "@/lib/dates";
import { money, reasonLabel } from "@/lib/format";
import { listClients, listLocations } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { adjustAction, countAction, transferAction } from "@/server/stock-actions";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      client: true,
      balances: { include: { location: true }, orderBy: { location: { code: "asc" } } },
      movements: { include: { location: true, user: true }, orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  if (!product) notFound();
  const [clients, locations] = await Promise.all([listClients(), listLocations()]);
  const onHand = product.balances.reduce((sum, balance) => sum + balance.qty, 0);
  const zone = getTimeZone();
  return (
    <>
      <PageHeader
        title={`${product.client.code} · ${product.sku}`}
        detail={`${product.name}. ${onHand} on hand.${user.role === "OWNER" ? ` Value ${money(onHand * product.costCents)}.` : ""}`}
      />
      <Notices notice={query.notice} />
      {product.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.photoUrl} alt={`${product.name} photo`} className="h-40 w-40 rounded-2xl border border-line object-cover" />
      ) : null}
      {!product.photoOk ? <p className="text-warn">The last photo check could not open the link.</p> : null}
      <p className="text-sm text-stone-600">
        {product.lengthMm} × {product.widthMm} × {product.heightMm} mm · {product.weightGrams} g
        {product.barcode ? ` · barcode ${product.barcode}` : ""}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {product.balances.map((balance) => (
          <li key={balance.id} className="card">
            <p className="text-sm text-stone-600">{balance.location.code}</p>
            <p className="text-2xl font-semibold">{balance.qty}</p>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 lg:grid-cols-3">
        <DeskForm action={countAction} submit="Save count" className="card grid gap-3">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="back" value={`/products/${product.id}`} />
          <h2 className="font-semibold">Cycle count</h2>
          <SelectField label="Bin" name="locationId" required>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          <Field label="What you counted" name="counted" type="number" required />
        </DeskForm>
        <DeskForm action={adjustAction} submit="Adjust" className="card grid gap-3">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="back" value={`/products/${product.id}`} />
          <h2 className="font-semibold">Adjust</h2>
          <SelectField label="Bin" name="locationId" required>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          <Field label="Add or remove" name="delta" type="number" required hint="Use -2 to remove two." />
          <Field label="Reason" name="note" required />
        </DeskForm>
        <DeskForm action={transferAction} submit="Move" className="card grid gap-3">
          <input type="hidden" name="productId" value={product.id} />
          <h2 className="font-semibold">Move bins</h2>
          <SelectField label="From" name="fromId" required>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          <SelectField label="To" name="toId" required>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </SelectField>
          <Field label="Quantity" name="qty" type="number" required />
        </DeskForm>
      </div>
      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">History</h2>
        {product.movements.length === 0 ? <p className="text-stone-600">No changes yet.</p> : null}
        <ul className="grid gap-2">
          {product.movements.map((movement) => (
            <li key={movement.id} className="card text-sm">
              <span className="font-semibold">
                {reasonLabel(movement.reason)} {movement.qtyDelta > 0 ? `+${movement.qtyDelta}` : movement.qtyDelta}
              </span>
              <span className="text-stone-600">
                {" "}
                at {movement.location.code} · {movement.qtyBefore} → {movement.qtyAfter} · {movement.user?.name || "System"} ·{" "}
                {formatWhen(movement.createdAt, zone)}
              </span>
              {movement.note ? <span className="block">{movement.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>
      <ProductForm user={user} clients={clients} product={product} />
    </>
  );
}

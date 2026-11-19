import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatWhen, getTimeZone } from "@/lib/dates";
import { reasonLabel } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Activity" };

export default async function ActivityPage() {
  await requireUser();
  const rows = await db.inventoryMovement.findMany({
    include: { product: { include: { client: true } }, location: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const zone = getTimeZone();
  return (
    <>
      <PageHeader title="Activity" detail="Every stock change is kept. Counts, picks, receives, and moves all land here." />
      {rows.length === 0 ? (
        <Empty title="No movements yet" detail="The first receive or count will show up here." href="/scan" label="Scan" />
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.id} className="card text-sm">
              <Link href={`/products/${row.productId}`} className="font-semibold">
                {row.product.client.code} · {row.product.sku}
              </Link>
              <p>
                {reasonLabel(row.reason)} {row.qtyDelta > 0 ? `+${row.qtyDelta}` : row.qtyDelta} at {row.location.code} · {row.qtyBefore} → {row.qtyAfter}
              </p>
              <p className="text-stone-600">
                {row.user?.name || "System"} · {formatWhen(row.createdAt, zone)}
                {row.note ? ` · ${row.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

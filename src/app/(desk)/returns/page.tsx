import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { labelStatus } from "@/lib/order-status";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Returns" };

export default async function ReturnsPage() {
  await requireUser();
  const rows = await db.return.findMany({
    include: { client: true, order: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <>
      <PageHeader title="Returns" detail="Open a return from a shipped order, then scan the units back into a bin." />
      {rows.length === 0 ? (
        <Empty title="No returns" detail="When a customer sends something back, open the order and start a return." href="/orders" label="Orders" />
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/returns/${row.id}`} className="card flex items-center justify-between gap-3">
                <span>
                  <span className="font-semibold">
                    {row.client.code} · {row.order?.externalRef || "No order"}
                  </span>
                  <span className="block text-sm text-stone-600">{row.reason || "No reason yet"}</span>
                </span>
                <Pill>{labelStatus(row.status)}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

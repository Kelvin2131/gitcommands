import Link from "next/link";
import { Empty, Notices, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { listClients } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const clients = await listClients();
  return (
    <>
      <PageHeader
        title="Clients"
        detail="Each 3PL customer keeps their own products, stock, and invoices."
        action={
          user.role === "OWNER" ? (
            <Link href="/clients/new" className="btn">
              Add client
            </Link>
          ) : null
        }
      />
      <Notices notice={query.notice} />
      {clients.length === 0 ? (
        <Empty title="No clients yet" detail="Add the first seller you fulfill for." href="/clients/new" label="Add client" />
      ) : (
        <ul className="grid gap-2">
          {clients.map((client) => (
            <li key={client.id}>
              <Link href={`/clients/${client.id}`} className="card block">
                <span className="font-semibold">
                  {client.code} · {client.name}
                </span>
                <span className="block text-sm text-stone-600">
                  {client.active ? "Active" : "Paused"}
                  {user.role === "OWNER"
                    ? ` · pick ${money(client.pickFeeCents)} · ${money(client.packFeeCents)} per box`
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

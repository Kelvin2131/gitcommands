import Link from "next/link";
import { requireUser } from "@/lib/session";

export default async function MorePage() {
  const user = await requireUser();
  const links = [
    ["/inventory", "Stock"],
    ["/receive", "Receive"],
    ["/returns", "Returns"],
    ["/products", "Products"],
    ["/clients", "Clients"],
    ["/import", "Import CSV"],
    ["/activity", "Activity"],
    ...(user.role === "OWNER" ? [["/billing", "Billing"], ["/team", "Team"]] : []),
  ];
  return (
    <>
      <h1 className="text-3xl font-semibold">More</h1>
      <ul className="grid gap-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href!} className="btn-ghost w-full justify-start">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

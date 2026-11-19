import { SideNav } from "@/components/nav";
import { requireUser } from "@/lib/session";
import { signOut } from "@/server/session-actions";

const links = [
  { href: "/dashboard", label: "Today" },
  { href: "/scan", label: "Scan" },
  { href: "/orders", label: "Orders" },
  { href: "/inventory", label: "Stock" },
  { href: "/receive", label: "Receive" },
  { href: "/returns", label: "Returns" },
  { href: "/products", label: "Products" },
  { href: "/clients", label: "Clients" },
  { href: "/import", label: "Import" },
  { href: "/activity", label: "Activity" },
  { href: "/billing", label: "Billing", owner: true },
  { href: "/team", label: "Team", owner: true },
];

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = links.filter((link) => !link.owner || user.role === "OWNER").map(({ href, label }) => ({ href, label }));
  const bottom = [
    { href: "/dashboard", label: "Today" },
    { href: "/scan", label: "Scan" },
    { href: "/orders", label: "Orders" },
    { href: "/more", label: "More" },
  ];
  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="hidden border-r border-line bg-card md:flex md:min-h-screen md:flex-col">
        <div className="px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">KAMO 3pl</p>
          <p className="text-2xl font-semibold">Cratekeep</p>
        </div>
        <SideNav items={items} layout="side" />
        <form action={signOut} className="mt-auto border-t border-line p-3">
          <p className="px-2 font-medium">{user.name}</p>
          <p className="px-2 text-xs uppercase tracking-wide text-stone-500">{user.role === "OWNER" ? "Owner" : "Staff"}</p>
          <button className="btn-ghost mt-3 w-full" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <div>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">KAMO 3pl</p>
            <p className="text-lg font-semibold leading-none">Cratekeep</p>
          </div>
          <form action={signOut}>
            <button className="min-h-11 px-2 text-sm font-semibold underline" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <main id="main" className="mx-auto grid max-w-6xl gap-4 px-4 py-4 pb-24 md:pb-10">
          {children}
        </main>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card md:hidden">
          <SideNav items={bottom} layout="bottom" />
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SideNav({ items, layout }: { items: { href: string; label: string }[]; layout: "side" | "bottom" }) {
  const path = usePathname();
  return (
    <nav className={layout === "bottom" ? "grid grid-cols-4" : "grid gap-1 px-2"} aria-label="Desk">
      {items.map((item) => {
        const on = path === item.href || (item.href !== "/dashboard" && path.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`${layout === "bottom" ? "flex min-h-14 items-center justify-center text-sm font-semibold" : "nav-link"} ${on ? "nav-on" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

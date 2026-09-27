"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Search, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileBottomNav({ cartCount }: { cartCount: number }) {
  const path = usePathname();
  if (path.startsWith("/checkout") || /^\/products\/[^/]+$/.test(path)) return null;
  const items = [
    { href: "/", label: "Home", icon: Home, active: path === "/" },
    { href: "/categories", label: "Categories", icon: LayoutGrid, active: path.startsWith("/categories") },
    { href: "/products", label: "Search", icon: Search, active: path === "/products" },
    { href: "/cart", label: "Cart", icon: ShoppingCart, active: path.startsWith("/cart"), badge: cartCount },
    { href: "/account", label: "Account", icon: User, active: path.startsWith("/account") || path === "/login" },
  ];
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur md:hidden" aria-label="Primary">
      <ul className="grid grid-cols-5">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", it.active ? "text-brand-700" : "text-slate-500")}>
              <it.icon className={cn("size-5", it.active && "stroke-[2.4]")} />
              {it.label}
              {it.badge ? <span className="absolute left-1/2 top-1 ml-2 grid min-w-4 place-items-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-white">{it.badge}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

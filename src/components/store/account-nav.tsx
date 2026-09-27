"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CreditCard, Heart, LayoutDashboard, LogOut, MapPin, Package, RotateCcw, User } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { cn } from "@/lib/utils";

const items = [
  { href: "/account", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/payments", label: "Payments", icon: CreditCard },
  { href: "/account/returns", label: "Returns & refunds", icon: RotateCcw },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/profile", label: "Profile & security", icon: User },
];

export function AccountNav({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-2xl lg:bg-white lg:p-2 lg:ring-1 lg:ring-line">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium lg:rounded-xl lg:border-0",
              active ? "border-brand-700 bg-brand-700 text-white lg:bg-brand-50 lg:text-brand-800" : "border-line bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            <it.icon className="size-4" />
            {it.label}
            {it.href === "/account/notifications" && unread > 0 && (
              <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-saffron-500 px-1 text-[11px] font-bold text-white">{unread}</span>
            )}
          </Link>
        );
      })}
      <button onClick={() => void logoutAction()} className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium text-red-600 lg:rounded-xl lg:border-0">
        <LogOut className="size-4" /> Sign out
      </button>
    </nav>
  );
}

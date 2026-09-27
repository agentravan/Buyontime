"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Bell, Boxes, ClipboardList, CreditCard, FolderTree, History, LogOut, Menu, Package, RotateCcw, Settings,
  Store, TicketPercent, Users,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/actions/auth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";

const NAV: { href: string; label: string; icon: typeof BarChart3; perm: Permission }[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: BarChart3, perm: "dashboard:view" },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, perm: "orders:view" },
  { href: "/admin/payments", label: "Payments", icon: CreditCard, perm: "payments:view" },
  { href: "/admin/returns", label: "Returns & refunds", icon: RotateCcw, perm: "returns:manage" },
  { href: "/admin/products", label: "Products", icon: Package, perm: "products:manage" },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes, perm: "inventory:manage" },
  { href: "/admin/categories", label: "Categories", icon: FolderTree, perm: "categories:manage" },
  { href: "/admin/customers", label: "Customers", icon: Users, perm: "customers:view" },
  { href: "/admin/coupons", label: "Coupons", icon: TicketPercent, perm: "coupons:manage" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, perm: "notifications:view" },
  { href: "/admin/audit", label: "Audit log", icon: History, perm: "audit:view" },
  { href: "/admin/settings", label: "Settings", icon: Settings, perm: "settings:manage" },
];

function NavList({ permissions, onNavigate }: { permissions: Permission[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {NAV.filter((n) => permissions.includes(n.perm)).map((n) => {
        const active = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition", active ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white")}>
            <n.icon className="size-4" /> {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ user, permissions, unread, children }: { user: { name: string; email: string; role: Role }; permissions: Permission[]; unread: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-4 bg-brand-950 p-4">
      <Link href="/admin/dashboard" className="flex items-center gap-2 px-2 py-1" onClick={onNavigate}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="size-8" />
        <div>
          <p className="font-extrabold leading-tight text-white">Buyontime</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-300">{user.role === "ADMIN" ? "Admin" : "Supplier"} portal</p>
        </div>
      </Link>
      <div className="flex-1 overflow-y-auto"><NavList permissions={permissions} onNavigate={onNavigate} /></div>
      <div className="space-y-1 border-t border-white/10 pt-3">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-brand-100 hover:bg-white/10"><Store className="size-4" /> View store</Link>
        <button onClick={() => void logoutAction()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-brand-100 hover:bg-white/10"><LogOut className="size-4" /> Sign out</button>
        <p className="truncate px-3 pt-1 text-[11px] text-brand-300">{user.email}</p>
      </div>
    </div>
  );
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar()}</aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <p className="truncate text-sm font-semibold text-muted">Hi, {user.name.split(" ")[0]}</p>
          <div className="ml-auto flex items-center gap-2">
            {permissions.includes("notifications:view") && <NotificationBell initialUnread={unread} />}
          </div>
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Menu" side="left" className="bg-brand-950 [&>div:first-child]:hidden [&>div:last-child]:p-0">
          {sidebar(() => setOpen(false))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

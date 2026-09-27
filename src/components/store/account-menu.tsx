"use client";

import Link from "next/link";
import { Bell, Heart, LayoutDashboard, LogOut, Package, User, UserCircle } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import type { SessionUser } from "@/lib/auth";

export function AccountMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <Link href="/login" className="flex items-center gap-2 rounded-xl p-2.5 text-sm font-semibold hover:bg-slate-100">
        <UserCircle className="size-5" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }
  const staff = user.role === "ADMIN" || user.role === "SUPPLIER";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl p-2.5 text-sm font-semibold hover:bg-slate-100 focus:outline-none">
        <UserCircle className="size-5" />
        <span className="hidden max-w-28 truncate sm:inline">{user.name.split(" ")[0]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Signed in as {user.email}</DropdownMenuLabel>
        {staff && (
          <DropdownMenuItem asChild><Link href="/admin/dashboard"><LayoutDashboard /> Admin portal</Link></DropdownMenuItem>
        )}
        <DropdownMenuItem asChild><Link href="/account"><User /> My account</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/account/orders"><Package /> Orders</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/account/wishlist"><Heart /> Wishlist</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/account/notifications"><Bell /> Notifications</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void logoutAction(); }}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

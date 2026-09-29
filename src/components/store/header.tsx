import Link from "next/link";
import { Bell, Search, ShoppingCart } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { AccountMenu } from "./account-menu";

export function Logo({ name = "Buyontime" }: { name?: string }) {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label={`${name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="size-8 transition duration-500 ease-[var(--ease-spring)] group-hover:rotate-[-8deg] group-hover:scale-110" width={32} height={32} />
      <span className="text-lg font-extrabold tracking-tight text-brand-800">
        {name === "Buyontime" ? (<>Buy<span className="text-saffron-500">on</span>time</>) : name}
      </span>
    </Link>
  );
}

export function SearchBox({ defaultValue, className }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/products" role="search" className={className}>
      <label className="relative block">
        <span className="sr-only">Search products</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={defaultValue}
          placeholder="Search for products, brands and more"
          className="h-11 w-full rounded-xl border border-line bg-slate-50 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-brand-100"
          autoComplete="off"
        />
      </label>
    </form>
  );
}

export function StoreHeader({
  user, cartCount, unread, categories, storeName,
}: { user: SessionUser | null; cartCount: number; unread: number; categories: { name: string; slug: string }[]; storeName: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md backdrop-saturate-150">
      <div className="container-page flex h-16 items-center gap-3 sm:gap-6">
        <Logo name={storeName} />
        <SearchBox className="hidden flex-1 md:block" />
        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          {user && (
            <Link href="/account/notifications" className="relative hidden rounded-xl p-2.5 hover:bg-slate-100 sm:block" aria-label="Notifications">
              <Bell className="size-5" />
              {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          )}
          <AccountMenu user={user} />
          <Link href="/cart" className="relative flex items-center gap-2 rounded-xl p-2.5 hover:bg-slate-100" aria-label={`Cart, ${cartCount} items`}>
            <ShoppingCart className="size-5" />
            <span className="hidden text-sm font-semibold lg:inline">Cart</span>
            {cartCount > 0 && (
              <span key={cartCount} className="absolute right-0.5 top-0.5 grid min-w-5 animate-pop place-items-center rounded-full bg-brand-700 px-1 text-[11px] font-bold text-white lg:static">{cartCount}</span>
            )}
          </Link>
        </nav>
      </div>
      <div className="container-page pb-3 md:hidden">
        <SearchBox />
      </div>
      <div className="hidden border-t border-line md:block">
        <nav className="container-page scrollbar-none flex h-11 items-center gap-6 overflow-x-auto text-sm font-medium text-slate-600">
          <Link href="/products" className="nav-underline whitespace-nowrap hover:text-brand-700">All products</Link>
          {categories.map((c) => (
            <Link key={c.slug} href={`/products?category=${c.slug}`} className="nav-underline whitespace-nowrap hover:text-brand-700">{c.name}</Link>
          ))}
          <Link href="/products?onSale=1" className="whitespace-nowrap font-semibold text-saffron-600">Deals</Link>
        </nav>
      </div>
    </header>
  );
}

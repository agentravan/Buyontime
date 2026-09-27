import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { firstName } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AccountShortcuts, OfferCard, OrderCard } from "@/components/store/account-widgets";
import { ProductRail } from "@/components/store/product-card";
import { recommendationsFor, wishlistIds } from "@/server/catalog";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountHome() {
  const user = await requireUser();
  const [orders, orderCount, wishlist, addresses, unread, notifications, offers, recs, saved] = await Promise.all([
    db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 3, include: { items: true } }),
    db.order.count({ where: { userId: user.id } }),
    db.wishlistItem.count({ where: { userId: user.id } }),
    db.address.count({ where: { userId: user.id } }),
    db.notification.count({ where: { audience: "CUSTOMER", userId: user.id, readAt: null } }),
    db.notification.findMany({ where: { audience: "CUSTOMER", userId: user.id }, orderBy: { createdAt: "desc" }, take: 4 }),
    db.coupon.findMany({ where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: "desc" }, take: 2 }),
    recommendationsFor(user.id, 8),
    wishlistIds(user.id),
  ]);
  const active = orders.find((o) => ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY"].includes(o.status));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-600 p-5 text-white sm:p-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome back, {firstName(user.name)}!</h1>
        <p className="mt-1 text-sm text-brand-100">
          {active
            ? ["SHIPPED", "OUT_FOR_DELIVERY"].includes(active.status) ? "Your order is on the way." : "Your order is confirmed and being prepared."
            : orders[0]?.status === "DELIVERED" ? "Your previous order was delivered. Enjoy!" : "Here's everything about your orders, payments and more."}
        </p>
      </div>
      <AccountShortcuts counts={{ orders: orderCount, wishlist, addresses, unread }} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent orders</h2>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>
        </div>
        {orders.length === 0 ? (
          <Card className="p-5 text-sm text-muted">No orders yet. <Link href="/products" className="font-semibold text-brand-700">Start shopping</Link></Card>
        ) : (
          <div className="space-y-3">{orders.map((o) => <OrderCard key={o.id} order={o} />)}</div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold">Offers for you</h2>
          {offers.length === 0 ? <Card className="p-4 text-sm text-muted">No active offers right now.</Card> : (
            <div className="space-y-2">{offers.map((c) => <OfferCard key={c.id} code={c.code} description={c.description} />)}</div>
          )}
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Notifications</h2>
            <Link href="/account/notifications" className="text-sm font-semibold text-brand-700 hover:underline">All</Link>
          </div>
          <Card className="divide-y divide-line">
            {notifications.length === 0 ? <p className="p-4 text-sm text-muted">You&apos;re all caught up.</p> : notifications.map((n) => (
              <Link key={n.id} href={n.link ?? "/account/notifications"} className="block p-3 hover:bg-slate-50">
                <p className="text-sm font-semibold">{!n.readAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-saffron-500" />}{n.title}</p>
                <p className="line-clamp-1 text-xs text-muted">{n.body}</p>
              </Link>
            ))}
          </Card>
        </section>
      </div>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <ProductRail title="Recommended for you" products={recs} savedIds={saved} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { firstName } from "@/lib/utils";
import { ProductRail } from "@/components/store/product-card";
import { TrustStrip } from "@/components/store/footer";
import { homeSections, recentlyViewed, recommendationsFor, wishlistIds } from "@/server/catalog";

export const revalidate = 0;

const tileColors = ["bg-brand-50", "bg-saffron-50", "bg-rose-50", "bg-sky-50", "bg-violet-50", "bg-emerald-50", "bg-amber-50", "bg-teal-50"];

export default async function HomePage() {
  const user = await getCurrentUser();
  const [settings, sections, categories, saved] = await Promise.all([
    getSettings(),
    homeSections(),
    db.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 8 }),
    wishlistIds(user?.id),
  ]);
  const [recs, recent, lastOrder] = user
    ? await Promise.all([
        recommendationsFor(user.id),
        recentlyViewed(user.id, 10),
        db.order.findFirst({ where: { userId: user.id, status: { notIn: ["PENDING_PAYMENT"] } }, orderBy: { createdAt: "desc" } }),
      ])
    : [[], [], null];

  return (
    <div>
      {user && (
        <div className="border-b border-line bg-brand-50/60">
          <div className="container-page flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <p className="font-semibold text-brand-900">Welcome back, {firstName(user.name)}!</p>
            {lastOrder && (
              <Link href={`/account/orders/${lastOrder.orderNumber}`} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                {lastOrder.status === "DELIVERED" ? "Your previous order was delivered" : ["SHIPPED", "OUT_FOR_DELIVERY"].includes(lastOrder.status) ? "Your order is on the way" : "Track your latest order"}
                <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      )}

      <section className="container-page pt-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-6 text-white sm:p-10 lg:col-span-2">
            <div className="absolute -right-16 -top-16 size-64 rounded-full bg-white/10" />
            <div className="absolute -bottom-20 right-24 size-48 rounded-full bg-saffron-400/25" />
            <p className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Sparkles className="size-3.5" /> New season picks</p>
            <h1 className="relative mt-4 max-w-md text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {settings.tagline ?? "Everything you need, delivered on time."}
            </h1>
            <p className="relative mt-3 max-w-md text-sm text-brand-100 sm:text-base">
              Honest prices, quality-checked products and a delivery promise you can plan around.
            </p>
            <div className="relative mt-6 flex flex-wrap gap-3">
              <Link href="/products" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-brand-800 hover:bg-brand-50">Start shopping <ArrowRight className="size-4" /></Link>
              <Link href="/products?onSale=1" className="inline-flex h-11 items-center rounded-xl bg-saffron-500 px-5 text-sm font-bold text-white hover:bg-saffron-600">Today&apos;s deals</Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Link href="/products?onSale=1" className="group flex flex-col justify-between rounded-3xl bg-saffron-100 p-6">
              <p className="text-xs font-bold uppercase tracking-wide text-saffron-600">Limited time</p>
              <p className="mt-2 text-2xl font-extrabold text-ink">Up to 60% off <br />on bestsellers</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-saffron-600 group-hover:gap-2">Shop deals <ArrowRight className="size-4" /></span>
            </Link>
            <div className="flex flex-col justify-between rounded-3xl bg-white p-6 ring-1 ring-line">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Free delivery</p>
              <p className="mt-2 text-lg font-extrabold">On orders above ₹{Math.round(settings.freeShippingThreshold / 100)}</p>
              <p className="mt-1 text-sm text-muted">Pay online or choose Cash on Delivery where available.</p>
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="container-page py-6">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">Shop by category</h2>
            <Link href="/categories" className="text-sm font-semibold text-brand-700 hover:underline">All categories</Link>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((c, i) => (
              <Link key={c.id} href={`/products?category=${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
                <span className={`grid aspect-square w-full place-items-center overflow-hidden rounded-2xl ${tileColors[i % tileColors.length]} transition group-hover:shadow-card`}>
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="size-3/5 object-contain" loading="lazy" />
                  ) : (
                    <span className="text-2xl font-extrabold text-brand-700">{c.name.charAt(0)}</span>
                  )}
                </span>
                <span className="line-clamp-2 text-xs font-semibold sm:text-sm">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {user && <ProductRail title="Recommended for you" subtitle="Based on what you browse and buy" products={recs} savedIds={saved} />}
      <ProductRail title="Featured" products={sections.featured} savedIds={saved} href="/products" />
      <ProductRail title="Deals of the day" subtitle="Biggest discounts right now" products={sections.deals} savedIds={saved} href="/products?onSale=1" />
      <ProductRail title="Best sellers" products={sections.best} savedIds={saved} href="/products?sort=popular" />
      <ProductRail title="New arrivals" products={sections.newest} savedIds={saved} href="/products?sort=newest" />
      {user && <ProductRail title="Recently viewed" products={recent} savedIds={saved} />}

      <section className="container-page py-6"><TrustStrip /></section>
    </div>
  );
}

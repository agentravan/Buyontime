import Link from "next/link";
import { ArrowRight, BadgePercent, Sparkles, Truck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { firstName } from "@/lib/utils";
import { ProductRail } from "@/components/store/product-card";
import { TrustStrip } from "@/components/store/footer";
import { FlowLines } from "@/components/motion/flow-lines";
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
          {/* Hero: dark teal glass over flowing light — same design language as the new sign-in pages */}
          <div className="relative isolate overflow-hidden rounded-3xl p-6 text-white sm:p-10 lg:col-span-2">
            <FlowLines palette="hero" className="-z-10" />
            {/* Keeps the headline readable over the light streaks */}
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-950/75 via-brand-950/35 to-transparent" />
            <p className="glass inline-flex animate-rise items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"><Sparkles className="size-3.5 text-saffron-300" /> New season picks</p>
            <h1 className="mt-4 max-w-md animate-rise text-3xl font-extrabold leading-tight tracking-tight [animation-delay:80ms] sm:text-5xl">
              {settings.tagline ?? "Everything you need, delivered on time."}
            </h1>
            <p className="mt-3 max-w-md animate-rise text-sm text-white/75 [animation-delay:160ms] sm:text-base">
              Honest prices, quality-checked products and a delivery promise you can plan around.
            </p>
            <div className="mt-7 flex animate-rise flex-wrap gap-3 [animation-delay:240ms]">
              <Link href="/products" className="sheen press inline-flex h-12 items-center gap-2 rounded-xl bg-saffron-400 px-6 text-sm font-extrabold text-brand-950 [animation:var(--animate-glow)] hover:bg-saffron-300">Start shopping <ArrowRight className="size-4" /></Link>
              <Link href="/products?onSale=1" className="glass press inline-flex h-12 items-center rounded-xl px-6 text-sm font-bold text-white hover:bg-white/15">Today&apos;s deals</Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Link href="/products?onSale=1" className="group relative flex animate-rise flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-saffron-100 to-saffron-200 p-6 transition duration-300 [animation-delay:120ms] hover:-translate-y-1 hover:shadow-lift">
              <BadgePercent aria-hidden className="absolute -right-4 -top-4 size-28 animate-float text-saffron-400/30" />
              <p className="relative text-xs font-bold uppercase tracking-wide text-saffron-600">Limited time</p>
              <p className="relative mt-2 text-2xl font-extrabold text-ink">Up to 60% off <br />on bestsellers</p>
              <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-saffron-600 transition-all group-hover:gap-2.5">Shop deals <ArrowRight className="size-4" /></span>
            </Link>
            <div className="relative flex animate-rise flex-col justify-between overflow-hidden rounded-3xl bg-white p-6 ring-1 ring-line [animation-delay:200ms]">
              <Truck aria-hidden className="absolute -right-3 bottom-2 size-24 text-brand-100" />
              <p className="relative text-xs font-bold uppercase tracking-wide text-brand-700">Free delivery</p>
              <p className="relative mt-2 text-lg font-extrabold">On orders above ₹{Math.round(settings.freeShippingThreshold / 100)}</p>
              <p className="relative mt-1 text-sm text-muted">Pay online or choose Cash on Delivery where available.</p>
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="reveal container-page py-6">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">Shop by category</h2>
            <Link href="/categories" className="text-sm font-semibold text-brand-700 hover:underline">All categories</Link>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((c, i) => (
              <Link key={c.id} href={`/products?category=${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
                <span className={`grid aspect-square w-full place-items-center overflow-hidden rounded-2xl ${tileColors[i % tileColors.length]} ring-1 ring-black/[0.03] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift`}>
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="size-3/5 object-contain transition duration-500 group-hover:scale-110 group-hover:-rotate-3" loading="lazy" />
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

      <section className="reveal container-page py-6"><TrustStrip /></section>
    </div>
  );
}

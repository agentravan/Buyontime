import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronRight, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { optimizedUrl } from "@/lib/images";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ProductGallery } from "@/components/store/product-gallery";
import { PurchasePanel } from "@/components/store/purchase-panel";
import { ProductRail, Rating } from "@/components/store/product-card";
import { ReviewForm } from "@/components/store/review-form";
import { getProductBySlug, productsByIds, recentlyViewed, recordView, wishlistIds } from "@/server/catalog";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "Product not found" };
  const description = p.description.replace(/\s+/g, " ").slice(0, 155);
  const image = p.images[0]?.url;
  return {
    title: p.name,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.name, description, type: "website", images: image ? [{ url: image.startsWith("http") ? optimizedUrl(image, 1200) : `${appUrl()}${image}` }] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const user = await getCurrentUser();
  const settings = await getSettings();

  const [saved, recent, similarRows, purchased, myReview] = await Promise.all([
    wishlistIds(user?.id),
    user ? recentlyViewed(user.id, 10, product.id) : Promise.resolve([]),
    db.product.findMany({ where: { categoryId: product.categoryId, status: "ACTIVE", deletedAt: null, id: { not: product.id } }, select: { id: true }, take: 10, orderBy: { ratingAvg: "desc" } }),
    user ? db.orderItem.findFirst({ where: { productId: product.id, order: { userId: user.id, status: { in: ["DELIVERED", "RETURNED", "RETURN_REQUESTED"] } } } }) : Promise.resolve(null),
    user ? db.review.findUnique({ where: { productId_userId: { productId: product.id, userId: user.id } } }) : Promise.resolve(null),
  ]);
  if (user) await recordView(user.id, product.id);
  const similar = await productsByIds(similarRows.map((r) => r.id));

  const totalStock = product.variants.reduce((s, v) => s + v.stock, 0);
  const specs = (Array.isArray(product.specs) ? product.specs : []) as { label: string; value: string }[];
  const eta = new Date(Date.now() + settings.estimatedDeliveryDays * 86400000);
  const base = appUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description.slice(0, 500),
    sku: product.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    image: product.images.map((i) => (i.url.startsWith("http") ? i.url : `${base}${i.url}`)),
    aggregateRating: product.ratingCount > 0 ? { "@type": "AggregateRating", ratingValue: product.ratingAvg.toFixed(1), reviewCount: product.ratingCount } : undefined,
    offers: {
      "@type": "Offer",
      url: `${base}/products/${product.slug}`,
      priceCurrency: "INR",
      price: (product.price / 100).toFixed(2),
      availability: totalStock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <div className="pb-24 md:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container-page py-4">
        <nav className="flex items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-brand-700">Home</Link>
          <ChevronRight className="size-3" />
          {product.category ? (
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-brand-700">{product.category.name}</Link>
          ) : <Link href="/products" className="hover:text-brand-700">Products</Link>}
          <ChevronRight className="size-3" />
          <span className="truncate text-slate-600">{product.name}</span>
        </nav>

        <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-10">
          <ProductGallery images={product.images.map((i) => ({ url: i.url, alt: i.alt ?? product.name }))} name={product.name} />
          <div className="animate-rise space-y-5 [animation-delay:80ms]">
            <div>
              {product.brand && <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{product.brand}</p>}
              <h1 className="mt-1 text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">{product.name}</h1>
              <div className="mt-2"><Rating avg={product.ratingAvg} count={product.ratingCount} /></div>
            </div>
            <PurchasePanel
              productId={product.id}
              basePrice={product.price}
              baseMrp={product.mrp}
              paymentOption={product.paymentOption}
              saved={saved.has(product.id)}
              variants={product.variants.map((v) => ({ id: v.id, name: v.name, isDefault: v.isDefault, price: v.price ?? product.price, mrp: v.mrp ?? product.mrp, stock: v.stock }))}
              lowStockThreshold={product.lowStockThreshold}
              codEnabled={settings.codEnabled}
            />
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                { icon: Truck, t: `Delivery by ${formatDate(eta)}` },
                { icon: RotateCcw, t: `${settings.returnWindowDays}-day returns` },
                { icon: ShieldCheck, t: "Secure payments" },
                { icon: BadgeCheck, t: "Quality checked" },
              ].map((b) => (
                <div key={b.t} className="flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-line">
                  <b.icon className="size-4 shrink-0 text-brand-700" /> <span>{b.t}</span>
                </div>
              ))}
            </div>
            <Card className="p-4 sm:p-5">
              <h2 className="font-bold">Product details</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{product.description}</p>
              {specs.length > 0 && (
                <dl className="mt-4 divide-y divide-line rounded-xl ring-1 ring-line">
                  {specs.map((s, i) => (
                    <div key={i} className="grid grid-cols-[40%_1fr] gap-2 px-3 py-2 text-sm">
                      <dt className="text-muted">{s.label}</dt>
                      <dd className="font-medium">{s.value}</dd>
                    </div>
                  ))}
                  <div className="grid grid-cols-[40%_1fr] gap-2 px-3 py-2 text-sm"><dt className="text-muted">SKU</dt><dd className="font-medium">{product.sku}</dd></div>
                </dl>
              )}
            </Card>
          </div>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" id="reviews">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Ratings & reviews</h2>
              <Rating avg={product.ratingAvg} count={product.ratingCount} />
            </div>
            {product.reviews.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No reviews yet. Customers who buy this product can review it after delivery.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {product.reviews.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">{r.rating} ★</span>
                      {r.title && <span className="text-sm font-semibold">{r.title}</span>}
                    </div>
                    {r.body && <p className="mt-1.5 text-sm text-slate-700">{r.body}</p>}
                    <p className="mt-1 text-xs text-muted">{r.user.name.split(" ")[0]} · Verified buyer · {formatDate(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div>
            {purchased ? (
              <ReviewForm productId={product.id} existing={myReview ? { rating: myReview.rating, title: myReview.title ?? "", body: myReview.body ?? "" } : null} />
            ) : (
              <Card className="p-4 text-sm text-muted">Only verified buyers can review this product after delivery.</Card>
            )}
          </div>
        </section>
      </div>
      <ProductRail title="Similar products" products={similar} savedIds={saved} />
      {recent.length > 0 && <ProductRail title="Recently viewed" products={recent} savedIds={saved} />}
    </div>
  );
}

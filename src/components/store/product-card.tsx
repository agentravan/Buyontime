import Link from "next/link";
import { Star } from "lucide-react";
import { ProductImage } from "@/components/product-image";
import { AddToCartButton, WishlistButton } from "@/components/store/cart-buttons";
import { discountPercent, formatINR } from "@/lib/money";
import type { ProductCardData } from "@/server/catalog";

export function Price({ price, mrp, size = "md" }: { price: number; mrp: number; size?: "md" | "lg" }) {
  const off = discountPercent(mrp, price);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={size === "lg" ? "text-2xl font-extrabold" : "text-base font-extrabold"}>{formatINR(price)}</span>
      {off > 0 && (
        <>
          <span className={size === "lg" ? "text-base text-muted line-through" : "text-xs text-muted line-through"}>{formatINR(mrp)}</span>
          <span className={size === "lg" ? "text-base font-bold text-emerald-600" : "text-xs font-bold text-emerald-600"}>{off}% off</span>
        </>
      )}
    </div>
  );
}

export function Rating({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-xs text-muted">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 font-bold text-white">
        {avg.toFixed(1)} <Star className="size-3 fill-white" />
      </span>
      <span className="text-muted">({count.toLocaleString("en-IN")})</span>
    </span>
  );
}

export function ProductCard({ product, saved, priority }: { product: ProductCardData; saved?: boolean; priority?: boolean }) {
  const off = discountPercent(product.mrp, product.price);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-card">
      <Link href={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden bg-slate-50">
        <ProductImage src={product.imageUrl} alt={product.name} priority={priority} className="transition duration-300 group-hover:scale-[1.03]" />
        {off >= 5 && (
          <span className="absolute left-2 top-2 rounded-full bg-saffron-500 px-2 py-0.5 text-[11px] font-bold text-white">{off}% OFF</span>
        )}
        {!product.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1.5 text-center text-xs font-semibold text-white">Out of stock</span>
        )}
      </Link>
      <div className="absolute right-2 top-2">
        <WishlistButton productId={product.id} initial={Boolean(saved)} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brand && <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{product.brand}</p>}
        <Link href={`/products/${product.slug}`} className="line-clamp-2 text-sm font-medium leading-snug hover:text-brand-700">
          {product.name}
        </Link>
        <Rating avg={product.ratingAvg} count={product.ratingCount} />
        <Price price={product.price} mrp={product.mrp} />
        <p className={product.inStock ? (product.lowStock ? "text-xs font-semibold text-saffron-600" : "text-xs text-emerald-700") : "text-xs text-red-600"}>
          {product.inStock ? (product.lowStock ? "Only a few left" : "In stock") : "Currently unavailable"}
          {product.paymentOption === "ONLINE_ONLY" ? " · Prepaid only" : product.paymentOption === "COD_ONLY" ? " · COD only" : ""}
        </p>
        <div className="mt-auto pt-1.5">
          {product.hasVariants || !product.defaultVariantId ? (
            <Link href={`/products/${product.slug}`} className="flex h-9 w-full items-center justify-center rounded-lg border border-brand-700 text-xs font-semibold text-brand-700 hover:bg-brand-50">
              Choose options
            </Link>
          ) : (
            <AddToCartButton variantId={product.defaultVariantId} size="sm" className="w-full" disabled={!product.inStock} label={product.inStock ? "Add to cart" : "Sold out"} />
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({ products, savedIds, priorityCount = 0 }: { products: ProductCardData[]; savedIds?: Set<string>; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p, i) => <ProductCard key={p.id} product={p} saved={savedIds?.has(p.id)} priority={i < priorityCount} />)}
    </div>
  );
}

export function ProductRail({ title, subtitle, products, savedIds, href }: { title: string; subtitle?: string; products: ProductCardData[]; savedIds?: Set<string>; href?: string }) {
  if (products.length === 0) return null;
  return (
    <section className="container-page py-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {href && <Link href={href} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">View all</Link>}
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {products.map((p) => (
          <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%] xl:w-[19%]">
            <ProductCard product={p} saved={savedIds?.has(p.id)} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="skeleton aspect-square rounded-none" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

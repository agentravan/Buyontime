import type { Metadata } from "next";
import { Suspense } from "react";
import { PackageSearch } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { pageParam, strParam } from "@/lib/utils";
import { EmptyState } from "@/components/ui/card";
import { Pagination } from "@/components/status";
import { ProductGrid, ProductGridSkeleton } from "@/components/store/product-card";
import { FilterPanel, SortSelect } from "@/components/store/filters";
import { listFacets, listProducts, wishlistIds } from "@/server/catalog";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const q = strParam(sp.q);
  const cat = strParam(sp.category);
  const title = q ? `Search results for “${q}”` : cat ? `${cat.replace(/-/g, " ")} — shop online` : "Shop all products";
  return { title, alternates: { canonical: cat ? `/products?category=${cat}` : "/products" }, robots: q ? { index: false } : undefined };
}

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const params = {
    q: strParam(sp.q),
    category: strParam(sp.category),
    brand: strParam(sp.brand),
    min: strParam(sp.min) ? Math.round(Number(strParam(sp.min)) * 100) : undefined,
    max: strParam(sp.max) ? Math.round(Number(strParam(sp.max)) * 100) : undefined,
    sort: strParam(sp.sort),
    inStock: strParam(sp.inStock) === "1",
    onSale: strParam(sp.onSale) === "1",
    rating: strParam(sp.rating) ? Number(strParam(sp.rating)) : undefined,
    page: pageParam(sp.page),
  };
  const raw: Record<string, string | undefined> = Object.fromEntries(
    ["q", "category", "brand", "min", "max", "sort", "inStock", "onSale", "rating"].map((k) => [k, strParam(sp[k])]),
  );
  const facets = await listFacets();
  const activeCategory = facets.categories.find((c) => c.slug === params.category);
  const heading = params.q ? `Results for “${params.q}”` : activeCategory?.name ?? (params.onSale ? "Deals" : "All products");

  return (
    <div className="container-page py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{heading}</h1>
        <div className="flex items-center gap-2">
          <FilterPanel facets={facets} current={raw} mobileOnly />
          <SortSelect current={raw} />
        </div>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden md:block">
          <FilterPanel facets={facets} current={raw} />
        </aside>
        <Suspense key={JSON.stringify(raw) + params.page} fallback={<ProductGridSkeleton />}>
          <Results params={params} raw={raw} />
        </Suspense>
      </div>
    </div>
  );
}

async function Results({ params, raw }: { params: Parameters<typeof listProducts>[0]; raw: Record<string, string | undefined> }) {
  const user = await getCurrentUser();
  const [result, saved] = await Promise.all([listProducts(params), wishlistIds(user?.id)]);
  if (result.items.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch />}
        title="No products found"
        description="Try a different search term or remove some filters."
      />
    );
  }
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{result.total.toLocaleString("en-IN")} products</p>
      <ProductGrid products={result.items} savedIds={saved} priorityCount={4} />
      <Pagination page={result.page} totalPages={result.totalPages} basePath="/products" params={raw} />
    </div>
  );
}

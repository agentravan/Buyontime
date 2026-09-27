import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "All categories" };

export default async function CategoriesPage() {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { status: "ACTIVE", deletedAt: null } } } } },
  });
  return (
    <div className="container-page py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">All categories</h1>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((c) => (
          <Link key={c.id} href={`/products?category=${c.slug}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 transition hover:shadow-card">
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50">
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="size-10 object-contain" loading="lazy" />
              ) : (
                <span className="text-xl font-extrabold text-brand-700">{c.name.charAt(0)}</span>
              )}
            </span>
            <span>
              <span className="block font-bold">{c.name}</span>
              <span className="text-xs text-muted">{c._count.products} products</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

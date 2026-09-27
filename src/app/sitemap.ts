import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  let products: { slug: string; updatedAt: Date }[] = [];
  let categories: { slug: string; updatedAt: Date }[] = [];
  try {
    [products, categories] = await Promise.all([
      db.product.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { slug: true, updatedAt: true }, take: 5000 }),
      db.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    ]);
  } catch (err) {
    console.error("[sitemap] database unavailable", err);
  }
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.6 },
    ...categories.map((c) => ({ url: `${base}/products?category=${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...["shipping", "returns", "terms", "privacy", "grievance", "contact"].map((s) => ({ url: `${base}/policies/${s}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}

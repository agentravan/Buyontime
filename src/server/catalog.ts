import "server-only";
import type { PaymentOption, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type ProductCardData = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  price: number;
  mrp: number;
  imageUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
  lowStock: boolean;
  defaultVariantId: string | null;
  hasVariants: boolean;
  paymentOption: PaymentOption;
};

export const cardSelect = {
  id: true, name: true, slug: true, brand: true, price: true, mrp: true, ratingAvg: true, ratingCount: true,
  paymentOption: true, lowStockThreshold: true,
  images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
  variants: { where: { isActive: true }, orderBy: { position: "asc" }, select: { id: true, stock: true, isDefault: true } },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

export function toCard(p: CardRow): ProductCardData {
  const stock = p.variants.reduce((s, v) => s + v.stock, 0);
  return {
    id: p.id, name: p.name, slug: p.slug, brand: p.brand, price: p.price, mrp: p.mrp,
    imageUrl: p.images[0]?.url ?? null, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount,
    inStock: stock > 0, lowStock: stock > 0 && stock <= p.lowStockThreshold,
    defaultVariantId: p.variants.length === 1 ? p.variants[0].id : null,
    hasVariants: p.variants.length > 1,
    paymentOption: p.paymentOption,
  };
}

export const visibleProduct: Prisma.ProductWhereInput = { status: "ACTIVE", deletedAt: null, OR: [{ categoryId: null }, { category: { isActive: true } }] };

export type ListParams = {
  q?: string;
  category?: string;
  brand?: string;
  min?: number;
  max?: number;
  sort?: string;
  inStock?: boolean;
  onSale?: boolean;
  rating?: number;
  page?: number;
  pageSize?: number;
};

export async function listProducts(params: ListParams) {
  const pageSize = Math.min(params.pageSize ?? 24, 48);
  const page = Math.max(1, params.page ?? 1);
  const and: Prisma.ProductWhereInput[] = [visibleProduct];
  if (params.q) {
    const q = params.q.slice(0, 80);
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { category: { name: { contains: q, mode: "insensitive" } } },
        { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (params.category) and.push({ category: { slug: params.category } });
  if (params.brand) and.push({ brand: { equals: params.brand, mode: "insensitive" } });
  if (params.min !== undefined) and.push({ price: { gte: params.min } });
  if (params.max !== undefined) and.push({ price: { lte: params.max } });
  if (params.inStock) and.push({ variants: { some: { isActive: true, stock: { gt: 0 } } } });
  if (params.onSale) and.push({ mrp: { gt: db.product.fields.price } });
  if (params.rating) and.push({ ratingAvg: { gte: params.rating } });

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    params.sort === "price_asc" ? [{ price: "asc" }]
      : params.sort === "price_desc" ? [{ price: "desc" }]
        : params.sort === "rating" ? [{ ratingAvg: "desc" }, { ratingCount: "desc" }]
          : params.sort === "popular" ? [{ ratingCount: "desc" }, { createdAt: "desc" }]
            : params.sort === "newest" ? [{ createdAt: "desc" }]
              : [{ isFeatured: "desc" }, { createdAt: "desc" }];

  const where: Prisma.ProductWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: cardSelect }),
    db.product.count({ where }),
  ]);
  return { items: rows.map(toCard), total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listFacets() {
  const [categories, brands] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, imageUrl: true } }),
    db.product.groupBy({ by: ["brand"], where: { ...visibleProduct, brand: { not: null } }, _count: { _all: true }, orderBy: { brand: "asc" } }),
  ]);
  return { categories, brands: brands.map((b) => b.brand!).filter(Boolean) };
}

export async function getProductBySlug(slug: string) {
  return db.product.findFirst({
    where: { slug, ...visibleProduct },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      variants: { where: { isActive: true }, orderBy: { position: "asc" } },
      reviews: { where: { isVisible: true }, orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { name: true } } } },
    },
  });
}

export async function bestSellerIds(take = 12): Promise<string[]> {
  const rows = await db.productVariant.groupBy({
    by: ["productId"],
    where: { product: visibleProduct },
    _sum: { soldCount: true },
    orderBy: { _sum: { soldCount: "desc" } },
    take,
  });
  return rows.filter((r) => (r._sum.soldCount ?? 0) > 0).map((r) => r.productId);
}

export async function productsByIds(ids: string[]): Promise<ProductCardData[]> {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, ...visibleProduct }, select: cardSelect });
  const map = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => map.get(id)).filter((x): x is ProductCardData => Boolean(x));
}

export async function homeSections() {
  const [featured, newest, saleRows, bestIds] = await Promise.all([
    db.product.findMany({ where: { ...visibleProduct, isFeatured: true }, orderBy: { updatedAt: "desc" }, take: 10, select: cardSelect }),
    db.product.findMany({ where: visibleProduct, orderBy: { createdAt: "desc" }, take: 10, select: cardSelect }),
    db.product.findMany({ where: { ...visibleProduct, mrp: { gt: db.product.fields.price } }, take: 40, select: cardSelect }),
    bestSellerIds(10),
  ]);
  const deals = saleRows
    .map(toCard)
    .sort((a, b) => (b.mrp - b.price) / b.mrp - (a.mrp - a.price) / a.mrp)
    .slice(0, 10);
  const best = bestIds.length > 0 ? await productsByIds(bestIds) : [];
  return { featured: featured.map(toCard), newest: newest.map(toCard), deals, best };
}

/** Personalised picks from categories the customer bought or viewed; falls back to best sellers. */
export async function recommendationsFor(userId: string, take = 10): Promise<ProductCardData[]> {
  const [viewed, bought] = await Promise.all([
    db.productView.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, take: 20, select: { product: { select: { categoryId: true, id: true } } } }),
    db.orderItem.findMany({ where: { order: { userId, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } } }, select: { productId: true, product: { select: { categoryId: true } } }, take: 50 }),
  ]);
  const cats = new Set<string>();
  viewed.forEach((v) => v.product.categoryId && cats.add(v.product.categoryId));
  bought.forEach((b) => b.product.categoryId && cats.add(b.product.categoryId));
  const exclude = new Set(bought.map((b) => b.productId));
  if (cats.size === 0) return productsByIds(await bestSellerIds(take));
  const rows = await db.product.findMany({
    where: { ...visibleProduct, categoryId: { in: [...cats] }, id: { notIn: [...exclude] } },
    orderBy: [{ ratingAvg: "desc" }, { createdAt: "desc" }],
    take,
    select: cardSelect,
  });
  return rows.map(toCard);
}

export async function recentlyViewed(userId: string, take = 10, excludeId?: string): Promise<ProductCardData[]> {
  const rows = await db.productView.findMany({
    where: { userId, ...(excludeId ? { productId: { not: excludeId } } : {}), product: visibleProduct },
    orderBy: { viewedAt: "desc" },
    take,
    select: { product: { select: cardSelect } },
  });
  return rows.map((r) => toCard(r.product));
}

export async function recordView(userId: string, productId: string) {
  await db.productView.upsert({
    where: { userId_productId: { userId, productId } },
    update: { viewedAt: new Date(), viewCount: { increment: 1 } },
    create: { userId, productId },
  });
}

export async function wishlistIds(userId: string | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db.wishlistItem.findMany({ where: { userId }, select: { productId: true } });
  return new Set(rows.map((r) => r.productId));
}

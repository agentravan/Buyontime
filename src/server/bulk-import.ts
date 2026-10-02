import "server-only";
import { put } from "@vercel/blob";
import type { Prisma, ProductStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { allowedImageSource, bulkItemSchema, specList, variantSku } from "@/lib/bulk-import";
import { storageDriver } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { setStock } from "@/server/inventory";

const MAX_IMAGES = 5;
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

export type BulkResult = { sku: string; status: "created" | "skipped"; message: string; productId?: string; images: number };

/** Copies one marketplace picture into the store's own image storage. Returns null if it cannot be copied. */
async function copyImage(raw: string): Promise<{ url: string; storageKey: string } | null> {
  const src = allowedImageSource(raw);
  if (!src) return null;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(8000), redirect: "error", headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    const blob = await put(`products/${Date.now()}.${ext}`, buf, { access: "public", addRandomSuffix: true, contentType: type });
    return { url: blob.url, storageKey: `blob:${blob.url}` };
  } catch {
    return null;
  }
}

/**
 * Creates one product from an import row: copies its pictures into the store's storage, then creates the
 * product, its variants and opening stock. A row whose SKU already exists is skipped, so a file can be
 * imported again safely.
 */
export async function importOne(actor: SessionUser, raw: unknown, opts: { status: ProductStatus; stock: number }): Promise<BulkResult> {
  const item = bulkItemSchema.parse(raw);
  if (storageDriver() !== "blob") throw new AppError("Bulk import needs Vercel Blob image storage.", "STORAGE_NOT_CONFIGURED", 503);
  const stock = Math.max(0, Math.min(100000, Math.floor(opts.stock)));
  const single = item.variants.length === 1;
  const skus = item.variants.map((v) => variantSku(item.sku, v, single));
  if (new Set(skus).size !== skus.length) throw new AppError(`${item.sku}: two sizes produce the same SKU.`);

  const [existing, variantClash] = await Promise.all([
    db.product.findFirst({ where: { sku: item.sku }, select: { id: true } }),
    db.productVariant.findFirst({ where: { sku: { in: skus } }, select: { sku: true } }),
  ]);
  if (existing || variantClash) return { sku: item.sku, status: "skipped", message: "Already in the store (same SKU).", images: 0 };

  const category = item.category ? await db.category.findUnique({ where: { slug: item.category }, select: { id: true } }) : null;

  const copied = (await Promise.all(item.image_urls.slice(0, MAX_IMAGES).map(copyImage))).filter((x): x is { url: string; storageKey: string } => x !== null);

  const product = await db.$transaction(async (tx) => {
    // Free slug (queried through the transaction client: production uses a single pooled connection).
    const root = slugify(item.name) || "product";
    let slug = root;
    for (let i = 2; i < 50; i++) {
      if (!(await tx.product.findFirst({ where: { slug }, select: { id: true } }))) break;
      slug = `${root}-${i}`;
    }
    const created = await tx.product.create({
      data: {
        name: item.name, slug, sku: item.sku, brand: item.brand || null, categoryId: category?.id ?? null,
        description: item.description, status: opts.status, paymentOption: item.payment_option,
        price: item.selling_price * 100, mrp: item.mrp * 100, costPrice: item.cost_price * 100,
        sourceName: item.source || null, sourceReference: item.source_url || null,
        specs: specList(item.specs) as Prisma.InputJsonValue,
      },
    });
    for (const [i, name] of item.variants.entries()) {
      const v = await tx.productVariant.create({
        data: { productId: created.id, name: single && /^default$/i.test(name) ? "Default" : name, sku: skus[i], stock: 0, isActive: true, position: i, isDefault: i === 0 },
      });
      if (stock > 0) await setStock(tx, v.id, stock, actor.id, "Bulk import");
    }
    for (const [pos, img] of copied.entries()) {
      await tx.productImage.create({ data: { productId: created.id, url: img.url, storageKey: img.storageKey, alt: item.name, position: pos } });
    }
    await audit({ actor, action: "product.create", entityType: "Product", entityId: created.id, newValue: { name: item.name, sku: item.sku, price: item.selling_price * 100, mrp: item.mrp * 100, paymentOption: item.payment_option, via: "bulk-import" } }, tx);
    return created;
  }, { timeout: 30000 });

  const wanted = Math.min(item.image_urls.length, MAX_IMAGES);
  const notes = [
    copied.length < wanted ? `${copied.length} of ${wanted} pictures copied` : `${copied.length} picture(s)`,
    item.category && !category ? `category "${item.category}" not found — left uncategorised` : "",
  ].filter(Boolean);
  return { sku: item.sku, status: "created", message: notes.join("; "), productId: product.id, images: copied.length };
}

"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { AppError, safeAction, type ActionResult } from "@/lib/errors";
import { deleteStoredImage, isAllowedImageUrl } from "@/lib/storage";
import { slugify } from "@/lib/utils";
import { categorySchema, productSchema } from "@/lib/validation";
import { checkLowStock, setStock } from "@/server/inventory";
import { composeListing, parsePastedText, type ImportedListing } from "@/lib/product-import";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { importFromUrl } from "@/server/product-import";
import { importOne, type BulkResult } from "@/server/bulk-import";

/**
 * Finds a free product slug. Pass the transaction client when called inside `$transaction`:
 * production uses a single pooled connection, so querying through `db` there would wait forever.
 */
async function uniqueSlug(client: Prisma.TransactionClient, base: string, excludeId?: string) {
  const root = slugify(base) || "product";
  let slug = root;
  for (let i = 2; i < 50; i++) {
    const clash = await client.product.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
    slug = `${root}-${i}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

function revalidateCatalog(slug?: string) {
  revalidatePath("/");
  revalidatePath("/products");
  if (slug) revalidatePath(`/products/${slug}`);
  revalidatePath("/admin/products");
}

type ImageInput = { id?: string; url: string; storageKey?: string | null; alt?: string | null };

export async function saveProductAction(input: unknown, id?: string, images?: ImageInput[]): Promise<ActionResult<{ id: string; slug: string }>> {
  return safeAction(async () => {
    const actor = await requirePermission("products:manage");
    const data = productSchema.parse(input);
    const skus = data.variants.map((v) => v.sku.toUpperCase());
    if (new Set(skus).size !== skus.length) throw new AppError("Each variant needs a unique SKU.");
    const clash = await db.productVariant.findFirst({
      where: { sku: { in: data.variants.map((v) => v.sku) }, ...(id ? { NOT: { productId: id } } : {}) },
      select: { sku: true },
    });
    if (clash) throw new AppError(`SKU ${clash.sku} is already used by another product.`);
    const skuClash = await db.product.findFirst({ where: { sku: data.sku, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
    if (skuClash) throw new AppError(`Product SKU ${data.sku} is already in use.`);
    if (images) {
      if (images.length > 12) throw new AppError("A product can have at most 12 images.");
      for (const img of images) if (!isAllowedImageUrl(img.url)) throw new AppError("Invalid image URL. Upload images using the uploader.");
    }

    const productData = {
      name: data.name,
      sku: data.sku,
      brand: data.brand || null,
      categoryId: data.categoryId || null,
      description: data.description,
      status: data.status,
      paymentOption: data.paymentOption,
      price: data.price,
      mrp: data.mrp,
      costPrice: data.costPrice,
      shippingCost: data.shippingCost,
      otherCost: data.otherCost,
      gstRate: data.gstRate,
      lowStockThreshold: data.lowStockThreshold,
      isFeatured: data.isFeatured,
      sourceName: data.sourceName || null,
      sourceReference: data.sourceReference || null,
      specs: data.specs as Prisma.InputJsonValue,
    };

    const touchedVariantIds: string[] = [];
    const result = await db.$transaction(async (tx) => {
      let product;
      if (id) {
        const before = await tx.product.findUnique({ where: { id }, include: { variants: true } });
        if (!before || before.deletedAt) throw new AppError("Product not found.");
        const slug = data.slug ? await uniqueSlug(tx, data.slug, id) : before.slug;
        product = await tx.product.update({ where: { id }, data: { ...productData, slug } });
        const d = diff(before as unknown as Record<string, unknown>, { ...productData, slug } as Record<string, unknown>);
        if (d.changed) {
          const priceKeys = ["price", "mrp", "costPrice"];
          const action = Object.keys(d.newValue).some((k) => priceKeys.includes(k)) ? "product.price_change" : Object.keys(d.newValue).includes("paymentOption") ? "product.payment_option_change" : "product.update";
          await audit({ actor, action, entityType: "Product", entityId: id, oldValue: d.oldValue, newValue: d.newValue }, tx);
        }
        // Variants: update existing, create new, deactivate removed (kept for order history).
        const keepIds = new Set(data.variants.filter((v) => v.id).map((v) => v.id!));
        for (const old of before.variants) {
          if (!keepIds.has(old.id) && old.isActive) {
            await tx.productVariant.update({ where: { id: old.id }, data: { isActive: false, sku: `${old.sku}-DEL-${Date.now().toString(36)}` } });
          }
        }
        for (const [i, v] of data.variants.entries()) {
          const existing = v.id ? before.variants.find((x) => x.id === v.id) : undefined;
          if (existing) {
            await tx.productVariant.update({
              where: { id: existing.id },
              data: { name: v.name, sku: v.sku, price: v.price ?? null, mrp: v.mrp ?? null, isActive: v.isActive, position: i, isDefault: i === 0 },
            });
            if (existing.stock !== v.stock) {
              await setStock(tx, existing.id, v.stock, actor.id, "Updated in product editor");
              await audit({ actor, action: "inventory.stock_change", entityType: "ProductVariant", entityId: existing.id, oldValue: { stock: existing.stock }, newValue: { stock: v.stock } }, tx);
            }
            touchedVariantIds.push(existing.id);
          } else {
            const created = await tx.productVariant.create({
              data: { productId: id, name: v.name, sku: v.sku, price: v.price ?? null, mrp: v.mrp ?? null, stock: 0, isActive: v.isActive, position: i, isDefault: i === 0 },
            });
            if (v.stock > 0) await setStock(tx, created.id, v.stock, actor.id, "Initial stock");
            touchedVariantIds.push(created.id);
          }
        }
      } else {
        const slug = await uniqueSlug(tx, data.slug || data.name);
        product = await tx.product.create({ data: { ...productData, slug } });
        for (const [i, v] of data.variants.entries()) {
          const created = await tx.productVariant.create({
            data: { productId: product.id, name: v.name, sku: v.sku, price: v.price ?? null, mrp: v.mrp ?? null, stock: 0, isActive: v.isActive, position: i, isDefault: i === 0 },
          });
          if (v.stock > 0) await setStock(tx, created.id, v.stock, actor.id, "Initial stock");
        }
        await audit({ actor, action: "product.create", entityType: "Product", entityId: product.id, newValue: { name: data.name, sku: data.sku, price: data.price, mrp: data.mrp, paymentOption: data.paymentOption } }, tx);
      }

      if (images) {
        const current = await tx.productImage.findMany({ where: { productId: product.id } });
        const keep = new Set(images.filter((i) => i.id).map((i) => i.id));
        const removed = current.filter((c) => !keep.has(c.id));
        if (removed.length) await tx.productImage.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
        for (const [pos, img] of images.entries()) {
          if (img.id && current.some((c) => c.id === img.id)) {
            await tx.productImage.update({ where: { id: img.id }, data: { position: pos, alt: img.alt ?? null } });
          } else {
            await tx.productImage.create({ data: { productId: product.id, url: img.url, storageKey: img.storageKey ?? null, alt: img.alt ?? null, position: pos } });
          }
        }
        return { product, removed };
      }
      return { product, removed: [] as { storageKey: string | null }[] };
    }, { timeout: 30000 });

    for (const r of result.removed) await deleteStoredImage(r.storageKey);
    await checkLowStock(touchedVariantIds);
    revalidateCatalog(result.product.slug);
    return { id: result.product.id, slug: result.product.slug };
  }, "Product saved");
}

/** Bulk import: creates ONE product from a row of the import file (the page sends rows one at a time). */
export async function bulkImportProductAction(row: unknown, opts: { publish: boolean; stock: number }): Promise<ActionResult<BulkResult>> {
  return safeAction(async () => {
    const actor = await requirePermission("products:manage");
    await rateLimit(`bulk-import:${actor.id}`, 300, 3600);
    const res = await importOne(actor, row, { status: opts.publish ? "ACTIVE" : "DRAFT", stock: Number(opts.stock) || 0 });
    if (res.status === "created") revalidateCatalog();
    return res;
  });
}

export async function setProductStatusAction(id: string, status: "ACTIVE" | "DISABLED" | "DRAFT"): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("products:manage");
    const before = await db.product.findUniqueOrThrow({ where: { id } });
    await db.product.update({ where: { id }, data: { status } });
    await audit({ actor, action: status === "ACTIVE" ? "product.enable" : "product.disable", entityType: "Product", entityId: id, oldValue: { status: before.status }, newValue: { status } });
    revalidateCatalog(before.slug);
    return null;
  }, status === "ACTIVE" ? "Product enabled" : "Product disabled");
}

/** Soft delete: the product disappears from the store but order history keeps its references. */
export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("products:manage");
    const before = await db.product.findUniqueOrThrow({ where: { id }, include: { variants: true } });
    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { deletedAt: new Date(), status: "DISABLED", slug: `${before.slug}-deleted-${Date.now().toString(36)}`, sku: `${before.sku}-DEL-${Date.now().toString(36)}` } });
      for (const v of before.variants) await tx.productVariant.update({ where: { id: v.id }, data: { isActive: false, sku: `${v.sku}-DEL-${Date.now().toString(36)}` } });
      await tx.cartItem.deleteMany({ where: { variant: { productId: id } } });
      await tx.wishlistItem.deleteMany({ where: { productId: id } });
      await audit({ actor, action: "product.delete", entityType: "Product", entityId: id, oldValue: { name: before.name, sku: before.sku, price: before.price, status: before.status } }, tx);
    });
    revalidateCatalog(before.slug);
    return null;
  }, "Product deleted");
}

export async function quickUpdateAction(variantId: string, input: { stock?: number; price?: number; mrp?: number }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("inventory:manage");
    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
    await db.$transaction(async (tx) => {
      if (input.stock !== undefined) {
        if (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > 1_000_000) throw new AppError("Stock must be a whole number ≥ 0.");
        if (input.stock !== v.stock) {
          await setStock(tx, variantId, input.stock, actor.id, "Quick update");
          await audit({ actor, action: "inventory.stock_change", entityType: "ProductVariant", entityId: variantId, oldValue: { stock: v.stock }, newValue: { stock: input.stock } }, tx);
        }
      }
      if (input.price !== undefined || input.mrp !== undefined) {
        const price = input.price ?? v.product.price;
        const mrp = input.mrp ?? v.product.mrp;
        if (price < 100) throw new AppError("Selling price must be at least ₹1.");
        if (mrp < price) throw new AppError("MRP cannot be lower than the selling price.");
        if (v.isDefault) {
          await tx.product.update({ where: { id: v.productId }, data: { price, mrp } });
        } else {
          await tx.productVariant.update({ where: { id: variantId }, data: { price, mrp } });
        }
        await audit({ actor, action: "product.price_change", entityType: "Product", entityId: v.productId, oldValue: { price: v.price ?? v.product.price, mrp: v.mrp ?? v.product.mrp }, newValue: { price, mrp } }, tx);
      }
    });
    await checkLowStock([variantId]);
    revalidateCatalog(v.product.slug);
    revalidatePath("/admin/inventory");
    return null;
  }, "Updated");
}

// ─────────────── Categories ───────────────

export async function saveCategoryAction(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const actor = await requirePermission("categories:manage");
    const data = categorySchema.parse(input);
    if (data.imageUrl && !isAllowedImageUrl(data.imageUrl)) throw new AppError("Upload the category image with the uploader.");
    const slug = slugify(data.slug || data.name);
    const clash = await db.category.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } });
    if (clash) throw new AppError("Another category already uses this URL name.");
    const payload = { name: data.name, slug, description: data.description || null, imageUrl: data.imageUrl || null, isActive: data.isActive, sortOrder: data.sortOrder };
    const saved = id ? await db.category.update({ where: { id }, data: payload }) : await db.category.create({ data: payload });
    await audit({ actor, action: id ? "category.update" : "category.create", entityType: "Category", entityId: saved.id, newValue: payload });
    revalidatePath("/admin/categories");
    revalidatePath("/");
    return { id: saved.id };
  }, "Category saved");
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("categories:manage");
    const count = await db.product.count({ where: { categoryId: id, deletedAt: null } });
    if (count > 0) throw new AppError(`Move or delete the ${count} product(s) in this category first, or disable it instead.`);
    const before = await db.category.delete({ where: { id } });
    await audit({ actor, action: "category.delete", entityType: "Category", entityId: id, oldValue: before });
    revalidatePath("/admin/categories");
    return null;
  }, "Category deleted");
}

/**
 * "Fill from a link" / "Paste product details" in the product editor. Returns a draft (name, brand,
 * SEO description, specifications, sizes) — nothing is saved, and photos/prices are never imported.
 */
export async function importProductDetailsAction(input: { url?: string; text?: string }): Promise<ActionResult<ImportedListing>> {
  return safeAction(async () => {
    const actor = await requirePermission("products:manage");
    await rateLimit(`product-import:${actor.id}`, 60, 3600);
    const { storeName } = await getSettings();
    const url = (input.url ?? "").trim();
    const text = (input.text ?? "").trim();
    if (text) {
      if (text.length > 20000) throw new AppError("That's too much text — paste just the product details.");
      const listing = composeListing(parsePastedText(text), { storeName, url: /^https?:\/\//i.test(url) ? url : undefined });
      if (!listing.name && listing.found.specs === 0 && listing.found.bullets === 0) throw new AppError("Couldn't find product details in that text.");
      return listing;
    }
    if (!url) throw new AppError("Paste a product link or the product details.");
    return importFromUrl(url, storeName);
  });
}


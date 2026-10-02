import { z } from "zod";

/**
 * Bulk product import: the shape of one row in the JSON file, and the short list of image hosts the
 * server is allowed to copy pictures from. Pure code (no network, no database) so it can be unit-tested.
 */

/** Marketplace image CDNs. The server only ever downloads from these hosts (never an arbitrary URL). */
const IMAGE_HOSTS = [/^images\.meesho\.com$/i, /^rukminim\d*\.flixcart\.com$/i, /^assets\.myntassets\.com$/i];

/** Returns a clean https URL when the image may be copied, otherwise null. */
export function allowedImageSource(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim().replace(/^http:\/\//i, "https://")); } catch { return null; }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return null;
  if (!IMAGE_HOSTS.some((h) => h.test(u.hostname))) return null;
  return u.toString();
}

const rupeeInt = z.coerce.number().int().min(1).max(10_000_000);

export const bulkItemSchema = z
  .object({
    sku: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, "SKU may contain letters, numbers, . _ -"),
    name: z.string().trim().min(3).max(160),
    brand: z.string().trim().max(80).nullish(),
    category: z.string().trim().max(70).nullish(),
    description: z.string().trim().min(10).max(10000),
    specs: z.record(z.string(), z.string()).optional().default({}),
    variants: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
    payment_option: z.enum(["ONLINE_ONLY", "COD_ONLY", "ONLINE_AND_COD"]),
    source: z.string().trim().max(120).nullish(),
    source_url: z.string().trim().max(300).nullish(),
    /** Rupees. */
    cost_price: rupeeInt,
    selling_price: rupeeInt,
    mrp: rupeeInt,
    image_urls: z.array(z.string().trim().max(600)).max(12).optional().default([]),
  })
  .refine((p) => p.mrp >= p.selling_price, { message: "MRP cannot be lower than the selling price", path: ["mrp"] })
  .refine((p) => new Set(p.variants.map((v) => v.toLowerCase())).size === p.variants.length, { message: "Variant names must be different", path: ["variants"] });

export type BulkItem = z.infer<typeof bulkItemSchema>;

/** SKU for one variant: the product SKU for a single default variant, otherwise SKU-SIZE. */
export function variantSku(productSku: string, variant: string, single: boolean): string {
  if (single) return productSku;
  return `${productSku}-${variant.toUpperCase().replace(/[^A-Z0-9]+/g, "")}`.slice(0, 64);
}

/** Spec object → the store's [{label, value}] list (blank and "NA" values dropped). */
export function specList(specs: Record<string, string>): { label: string; value: string }[] {
  return Object.entries(specs)
    .map(([label, value]) => ({ label: label.trim().slice(0, 60), value: String(value).trim().slice(0, 200) }))
    .filter((s) => s.label && s.value && !/^n\/?a$/i.test(s.value))
    .slice(0, 40);
}

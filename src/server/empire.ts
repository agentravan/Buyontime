import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { DEFAULT_TARGET_PROFIT, priceForTargetProfit } from "@/lib/target-price";
import { importOne } from "@/server/bulk-import";
import { orderProfit, profitInclude } from "@/server/profit";

/**
 * Read-only reporting and draft-product creation for the owner's AI Empire OS.
 * Authenticated with a shared bearer token (EMPIRE_API_TOKEN). Never publishes products,
 * never changes orders, never exposes customer contact details beyond what the owner needs to fulfil.
 */

export function empireAuthorised(header: string | null): boolean {
  const token = process.env.EMPIRE_API_TOKEN ?? "";
  if (token.length < 32) return false; // refuse weak or missing tokens
  const got = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${token}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

const FULFIL_STATUSES = ["CONFIRMED", "PROCESSING"] as const;

export async function empireSummary(since: Date) {
  const settings = await getSettings();
  const [orders, newCustomers, toFulfil] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: since }, status: { not: "PENDING_PAYMENT" } }, include: profitInclude }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: since } } }),
    db.order.findMany({
      where: { status: { in: [...FULFIL_STATUSES] } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        orderNumber: true, createdAt: true, city: true, state: true, pincode: true, total: true, paymentMethod: true, status: true,
        items: { select: { name: true, variantName: true, quantity: true, product: { select: { sourceName: true, sourceReference: true } } } },
      },
    }),
  ]);
  const customerIds = [...new Set(orders.map((o) => o.userId))];
  const repeatRows = customerIds.length
    ? await db.order.groupBy({ by: ["userId"], where: { userId: { in: customerIds }, status: { not: "PENDING_PAYMENT" } }, _count: { _all: true } })
    : [];
  const live = orders.filter((o) => o.status !== "CANCELLED");
  const withCoupon = live.filter((o) => o.couponCode);
  return {
    window: { since: since.toISOString(), until: new Date().toISOString() },
    orders: live.length,
    cancelled: orders.length - live.length,
    revenuePaise: live.reduce((s, o) => s + o.total, 0),
    estimatedProfitPaise: live.reduce((s, o) => s + orderProfit(o, settings).profit, 0),
    onlineOrders: live.filter((o) => o.paymentMethod === "ONLINE").length,
    codOrders: live.filter((o) => o.paymentMethod === "COD").length,
    newCustomers,
    repeatCustomers: repeatRows.filter((r) => r._count._all > 1).length,
    voucherOrders: withCoupon.length,
    voucherConversionPct: live.length ? Math.round((withCoupon.length / live.length) * 100) : 0,
    // Orders the owner must still place with the supplier (e.g. Meesho) — no customer phone/email included.
    toFulfil: toFulfil.map((o) => ({
      orderNumber: o.orderNumber, placedAt: o.createdAt.toISOString(), status: o.status, paymentMethod: o.paymentMethod,
      totalPaise: o.total, shipTo: `${o.city}, ${o.state} ${o.pincode}`,
      items: o.items.map((i) => ({ name: i.name, variant: i.variantName, quantity: i.quantity, supplier: i.product.sourceName, supplierLink: i.product.sourceReference })),
    })),
  };
}

export const empireProductSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(10000),
  supplierLink: z.string().trim().url().max(300),
  supplierName: z.string().trim().max(120).default("Meesho"),
  costPrice: z.number().int().min(100).max(100_000_000),        // paise
  shippingCost: z.number().int().min(0).max(10_000_000).default(0),
  otherCost: z.number().int().min(0).max(10_000_000).default(0),
  gstRate: z.number().int().min(0).max(28).default(5),
  mrp: z.number().int().min(100).max(100_000_000).optional(),     // the supplier's real MRP, if shown
  targetProfit: z.number().int().min(0).max(10_000_000).default(DEFAULT_TARGET_PROFIT),
  category: z.string().trim().max(70).optional(),
  variants: z.array(z.string().trim().min(1).max(60)).min(1).max(30).default(["Default"]),
  imageUrls: z.array(z.string().trim().max(600)).max(12).default([]),
  specs: z.record(z.string(), z.string()).default({}),
  dryRun: z.boolean().default(false),
});

/** Prices a supplier product for the target profit and (unless dryRun) creates it as a DRAFT. */
export async function createEmpireDraft(input: z.infer<typeof empireProductSchema>) {
  const s = await getSettings();
  const { price, profit } = priceForTargetProfit(
    { costPrice: input.costPrice, shippingCost: input.shippingCost, otherCost: input.otherCost, gstRate: input.gstRate },
    s, input.targetProfit,
  );
  // MRP is never invented: the supplier's MRP if it is higher, otherwise the selling price (no fake discount).
  const mrp = Math.max(price, input.mrp ?? price);
  if (input.dryRun) return { status: "priced" as const, pricePaise: price, mrpPaise: mrp, unitProfitPaise: profit };

  const admin = await db.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, phone: true, role: true, status: true, avatarUrl: true, codBlocked: true, createdAt: true } });
  if (!admin) throw new Error("No active admin account to attribute the import to");
  const sku = `MSH-${Date.now().toString(36).toUpperCase()}`;
  const result = await importOne(admin, {
    sku, name: input.name, description: input.description, category: input.category, variants: input.variants,
    payment_option: "ONLINE_AND_COD", source: input.supplierName, source_url: input.supplierLink,
    cost_price: Math.ceil(input.costPrice / 100), selling_price: price / 100, mrp: Math.ceil(mrp / 100),
    image_urls: input.imageUrls, specs: input.specs,
  }, { status: "DRAFT", stock: 0 });
  if (result.productId) {
    await db.product.update({ where: { id: result.productId }, data: { costPrice: input.costPrice, shippingCost: input.shippingCost, otherCost: input.otherCost, gstRate: input.gstRate } });
  }
  return { status: result.status, productId: result.productId, sku: result.sku, message: result.message, pricePaise: price, mrpPaise: mrp, unitProfitPaise: profit };
}

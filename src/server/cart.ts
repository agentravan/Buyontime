import "server-only";
import { cookies } from "next/headers";
import type { PaymentOption } from "@prisma/client";
import { db } from "@/lib/db";
import { hashToken, randomToken, type SessionUser } from "@/lib/auth";
import { isProduction } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const CART_COOKIE = "bot_cart";
export const MAX_QTY_PER_LINE = 10;

const lineInclude = {
  variant: {
    include: {
      product: {
        select: {
          id: true, name: true, slug: true, status: true, paymentOption: true, price: true, mrp: true, gstRate: true,
          deletedAt: true, brand: true,
          images: { orderBy: { position: "asc" as const }, take: 1, select: { url: true } },
        },
      },
    },
  },
};

export type CartLine = {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  variantName: string | null;
  imageUrl: string | null;
  unitPrice: number;
  unitMrp: number;
  gstRate: number;
  quantity: number;
  stock: number;
  paymentOption: PaymentOption;
  available: boolean;
  issue?: string;
};

async function guestToken(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) return existing;
  if (!create) return null;
  const token = randomToken(24);
  jar.set(CART_COOKIE, token, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return token;
}

/** Finds (or creates) the cart for the current shopper: user cart when signed in, cookie cart otherwise. */
export async function findCartId(user: SessionUser | null, create: boolean): Promise<string | null> {
  if (user) {
    const cart = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (cart) return cart.id;
    if (!create) return null;
    return (await db.cart.create({ data: { userId: user.id } })).id;
  }
  const token = await guestToken(create);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const cart = await db.cart.findUnique({ where: { guestToken: tokenHash }, select: { id: true } });
  if (cart) return cart.id;
  if (!create) return null;
  return (await db.cart.create({ data: { guestToken: tokenHash } })).id;
}

export async function getCartLines(cartId: string | null): Promise<CartLine[]> {
  if (!cartId) return [];
  const items = await db.cartItem.findMany({ where: { cartId }, include: lineInclude, orderBy: { createdAt: "asc" } });
  return items.map((i) => {
    const p = i.variant.product;
    const unitPrice = i.variant.price ?? p.price;
    let issue: string | undefined;
    if (p.status !== "ACTIVE" || p.deletedAt || !i.variant.isActive) issue = "No longer available";
    else if (i.variant.stock <= 0) issue = "Out of stock";
    else if (i.quantity > i.variant.stock) issue = `Only ${i.variant.stock} left`;
    return {
      id: i.id,
      variantId: i.variantId,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      variantName: i.variant.isDefault ? null : i.variant.name,
      imageUrl: p.images[0]?.url ?? null,
      unitPrice,
      unitMrp: i.variant.mrp ?? p.mrp,
      gstRate: p.gstRate,
      quantity: i.quantity,
      stock: i.variant.stock,
      paymentOption: p.paymentOption,
      available: !issue,
      issue,
    };
  });
}

export async function addItem(user: SessionUser | null, variantId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) throw new AppError("Invalid quantity.");
  const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant || !variant.isActive || variant.product.status !== "ACTIVE" || variant.product.deletedAt) {
    throw new AppError("This product is not available.");
  }
  const cartId = (await findCartId(user, true))!;
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const desired = Math.min((existing?.quantity ?? 0) + quantity, MAX_QTY_PER_LINE);
  if (desired > variant.stock) {
    throw new AppError(variant.stock <= 0 ? "Sorry, this item is out of stock." : `Only ${variant.stock} left in stock.`, "INSUFFICIENT_STOCK", 409);
  }
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { quantity: desired },
    create: { cartId, variantId, quantity: desired },
  });
  return desired;
}

export async function setItemQuantity(user: SessionUser | null, itemId: string, quantity: number) {
  const cartId = await findCartId(user, false);
  if (!cartId) throw new AppError("Cart not found.");
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId }, include: { variant: true } });
  if (!item) throw new AppError("Item not found in your cart.");
  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return 0;
  }
  if (quantity > MAX_QTY_PER_LINE) throw new AppError(`You can buy up to ${MAX_QTY_PER_LINE} of an item.`);
  if (quantity > item.variant.stock) throw new AppError(`Only ${item.variant.stock} left in stock.`, "INSUFFICIENT_STOCK", 409);
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return quantity;
}

/** Moves a guest cart into the user's cart after sign-in (quantities are merged and capped by stock). */
export async function mergeGuestCart(userId: string) {
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (!token) return;
  const guest = await db.cart.findUnique({ where: { guestToken: hashToken(token) }, include: { items: { include: { variant: true } } } });
  jar.delete(CART_COOKIE);
  if (!guest || guest.items.length === 0) {
    if (guest) await db.cart.delete({ where: { id: guest.id } });
    return;
  }
  const userCart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  for (const item of guest.items) {
    const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } } });
    const qty = Math.min((existing?.quantity ?? 0) + item.quantity, MAX_QTY_PER_LINE, Math.max(item.variant.stock, 1));
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
      update: { quantity: qty },
      create: { cartId: userCart.id, variantId: item.variantId, quantity: qty },
    });
  }
  await db.cart.delete({ where: { id: guest.id } });
}

export async function cartCount(user: SessionUser | null): Promise<number> {
  const cartId = await findCartId(user, false);
  if (!cartId) return 0;
  const agg = await db.cartItem.aggregate({ where: { cartId }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

/** Removes purchased variants from the user's cart (called once an order is confirmed). */
export async function removePurchasedFromCart(userId: string, variantIds: string[]) {
  const cart = await db.cart.findUnique({ where: { userId }, select: { id: true } });
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { cartId: cart.id, variantId: { in: variantIds } } });
}

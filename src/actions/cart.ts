"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { AppError, safeAction, type ActionResult } from "@/lib/errors";
import { addItem, setItemQuantity } from "@/server/cart";

export async function addToCartAction(variantId: string, quantity = 1): Promise<ActionResult<{ quantity: number }>> {
  return safeAction(async () => {
    const user = await getCurrentUser();
    const q = await addItem(user, String(variantId), Number(quantity));
    revalidatePath("/cart");
    return { quantity: q };
  }, "Added to cart");
}

export async function updateCartItemAction(itemId: string, quantity: number): Promise<ActionResult<{ quantity: number }>> {
  return safeAction(async () => {
    const user = await getCurrentUser();
    const q = await setItemQuantity(user, String(itemId), Math.floor(Number(quantity)));
    revalidatePath("/cart");
    return { quantity: q };
  });
}

export async function removeCartItemAction(itemId: string): Promise<ActionResult<{ quantity: number }>> {
  return updateCartItemAction(itemId, 0);
}

export async function toggleWishlistAction(productId: string): Promise<ActionResult<{ saved: boolean }>> {
  return safeAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AppError("Sign in to save items to your wishlist.", "UNAUTHENTICATED", 401);
    const existing = await db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId } } });
    if (existing) {
      await db.wishlistItem.delete({ where: { id: existing.id } });
      revalidatePath("/account/wishlist");
      return { saved: false };
    }
    const product = await db.product.findFirst({ where: { id: productId, status: "ACTIVE", deletedAt: null } });
    if (!product) throw new AppError("Product not available.");
    await db.wishlistItem.create({ data: { userId: user.id, productId } });
    revalidatePath("/account/wishlist");
    return { saved: true };
  });
}

export async function moveWishlistToCartAction(productId: string): Promise<ActionResult<{ quantity: number }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const variant = await db.productVariant.findFirst({ where: { productId, isActive: true }, orderBy: { position: "asc" } });
    if (!variant) throw new AppError("Product not available.");
    const q = await addItem(user, variant.id, 1);
    await db.wishlistItem.deleteMany({ where: { userId: user.id, productId } });
    revalidatePath("/account/wishlist");
    return { quantity: q };
  }, "Moved to cart");
}

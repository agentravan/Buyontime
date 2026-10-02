"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AppError, safeAction, type ActionResult } from "@/lib/errors";
import { notifyAdmin } from "@/lib/notifications/dispatch";
import { rateLimit } from "@/lib/rate-limit";
import { addressSchema, profileSchema } from "@/lib/validation";
import { isPincode, type PincodeInfo } from "@/lib/pincode";
import { cancelOrder } from "@/server/orders";
import { lookupPincode } from "@/server/pincode";
import { requestReturn } from "@/server/returns";

export async function saveAddressAction(input: Record<string, unknown> & { id?: string }): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const data = addressSchema.parse({ ...input, isDefault: Boolean(input.isDefault) });
    const count = await db.address.count({ where: { userId: user.id } });
    if (!input.id && count >= 20) throw new AppError("You can save up to 20 addresses.");
    const makeDefault = data.isDefault || count === 0;
    const clean = { ...data, line2: data.line2 || null, landmark: data.landmark || null, district: data.district || null, isDefault: makeDefault };
    const saved = await db.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      if (input.id) {
        const own = await tx.address.findFirst({ where: { id: String(input.id), userId: user.id } });
        if (!own) throw new AppError("Address not found.");
        return tx.address.update({ where: { id: own.id }, data: clean });
      }
      return tx.address.create({ data: { ...clean, userId: user.id } });
    });
    revalidatePath("/account/addresses");
    return { id: saved.id };
  }, "Address saved");
}

/** Pincode → city, district and state for the address form. Never throws for an unknown pincode. */
export async function lookupPincodeAction(pincode: string): Promise<ActionResult<PincodeInfo | null>> {
  return safeAction(async () => {
    const user = await requireUser();
    const pin = String(pincode ?? "").trim();
    if (!isPincode(pin)) return null;
    await rateLimit(`pincode:${user.id}`, 40, 60);
    return lookupPincode(pin);
  });
}

export async function deleteAddressAction(id: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    const own = await db.address.findFirst({ where: { id, userId: user.id } });
    if (!own) throw new AppError("Address not found.");
    await db.address.delete({ where: { id } });
    if (own.isDefault) {
      const next = await db.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      if (next) await db.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    revalidatePath("/account/addresses");
    return null;
  }, "Address removed");
}

export async function updateProfileAction(input: Record<string, unknown>): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    const data = profileSchema.parse(input);
    const dob = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (dob && (isNaN(dob.getTime()) || dob > new Date())) throw new AppError("Enter a valid date of birth.");
    await db.user.update({
      where: { id: user.id },
      data: {
        name: data.name, phone: data.phone, dateOfBirth: dob, gender: data.gender || null,
        emailOptIn: data.emailOptIn, smsOptIn: data.smsOptIn, whatsappOptIn: data.whatsappOptIn,
      },
    });
    revalidatePath("/account", "layout");
    return null;
  }, "Profile updated");
}

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    await db.notification.updateMany({
      where: { audience: "CUSTOMER", userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    revalidatePath("/account", "layout");
    return null;
  });
}

export async function cancelMyOrderAction(orderNumber: string, reason: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    await rateLimit(`cancel:${user.id}`, 10, 300);
    const order = await db.order.findUnique({ where: { orderNumber } });
    if (!order || order.userId !== user.id) throw new AppError("Order not found.");
    await cancelOrder(order.id, null, reason?.trim().slice(0, 200) || "Cancelled by customer", { byCustomerId: user.id });
    revalidatePath(`/account/orders/${orderNumber}`);
    return null;
  }, "Order cancelled");
}

export async function requestReturnAction(input: { orderNumber: string; items: { orderItemId: string; quantity: number }[]; reason: string; details?: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    await rateLimit(`return:${user.id}`, 10, 3600);
    if (!input.reason?.trim()) throw new AppError("Choose a reason for the return.");
    await requestReturn(user, input);
    revalidatePath(`/account/orders/${input.orderNumber}`);
    return null;
  }, "Return requested");
}

export async function submitReviewAction(input: { productId: string; rating: number; title?: string; body?: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    await rateLimit(`review:${user.id}`, 20, 3600);
    const rating = Math.round(Number(input.rating));
    if (rating < 1 || rating > 5) throw new AppError("Choose a rating from 1 to 5 stars.");
    const bought = await db.orderItem.findFirst({ where: { productId: input.productId, order: { userId: user.id, status: { in: ["DELIVERED", "RETURNED", "RETURN_REQUESTED"] } } } });
    if (!bought) throw new AppError("Only customers who received this product can review it.");
    await db.$transaction(async (tx) => {
      await tx.review.upsert({
        where: { productId_userId: { productId: input.productId, userId: user.id } },
        update: { rating, title: input.title?.trim().slice(0, 100) || null, body: input.body?.trim().slice(0, 2000) || null },
        create: { productId: input.productId, userId: user.id, rating, title: input.title?.trim().slice(0, 100) || null, body: input.body?.trim().slice(0, 2000) || null },
      });
      const agg = await tx.review.aggregate({ where: { productId: input.productId, isVisible: true }, _avg: { rating: true }, _count: { _all: true } });
      await tx.product.update({ where: { id: input.productId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all } });
    });
    const p = await db.product.findUnique({ where: { id: input.productId }, select: { slug: true } });
    if (p) revalidatePath(`/products/${p.slug}`);
    return null;
  });
}

export async function raiseSupportRequestAction(input: { orderNumber?: string; message: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    await rateLimit(`support:${user.id}`, 5, 3600);
    const message = input.message?.trim();
    if (!message || message.length < 10) throw new AppError("Please describe the issue (at least 10 characters).");
    const order = input.orderNumber ? await db.order.findUnique({ where: { orderNumber: input.orderNumber } }) : null;
    if (order && order.userId !== user.id) throw new AppError("Order not found.");
    const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!admin) throw new AppError("Support is unavailable right now.");
    await db.customerNote.create({
      data: { customerId: user.id, authorId: user.id, type: "COMPLAINT", status: "OPEN", orderId: order?.id ?? null, body: message.slice(0, 2000) },
    });
    await notifyAdmin("ADMIN_COMPLAINT", { orderId: order?.id, key: `complaint:${Date.now()}`, extra: { customerName: user.name } });
    return null;
  }, "Your request has been sent. Our team will get back to you.");
}

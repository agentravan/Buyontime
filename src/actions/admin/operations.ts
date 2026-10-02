"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { AppError, safeAction, type ActionResult } from "@/lib/errors";
import { notifyAdmin } from "@/lib/notifications/dispatch";
import { couponSchema, rupees } from "@/lib/validation";
import { updateOrderStatus, updateShipment } from "@/server/orders";
import { checkReconciliation, markCodCollected, resolveReconciliation } from "@/server/payments";
import { initiateRefund } from "@/server/refunds";
import { decideReturn, receiveReturn, refundReturn } from "@/server/returns";
import { adjustWallet } from "@/server/wallet";

const optionalUrl = z.string().trim().max(500).refine((v) => !v || /^https?:\/\//.test(v), "Tracking URL must start with http(s)://").optional();

const statusSchema = z.object({
  status: z.enum(["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RTO"]),
  courier: z.string().trim().max(60).optional(),
  trackingId: z.string().trim().max(80).optional(),
  trackingUrl: optionalUrl,
  estimatedDelivery: z.string().optional(),
  shippingCost: z.string().optional(),
  note: z.string().trim().max(300).optional(),
});

function revalidateOrder(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/dashboard");
}

function parseShipping(v?: string) {
  if (!v) return null;
  return rupees.parse(v);
}

export async function updateOrderStatusAction(orderId: string, input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("orders:update");
    const d = statusSchema.parse(input);
    await updateOrderStatus(orderId, actor, {
      status: d.status,
      courier: d.courier || null,
      trackingId: d.trackingId || null,
      trackingUrl: d.trackingUrl || null,
      estimatedDelivery: d.estimatedDelivery ? new Date(d.estimatedDelivery) : null,
      shippingCost: parseShipping(d.shippingCost),
      note: d.note || null,
    });
    revalidateOrder(orderId);
    return null;
  }, "Order updated");
}

export async function updateShipmentAction(orderId: string, input: Omit<z.input<typeof statusSchema>, "status">): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("orders:update");
    const d = statusSchema.omit({ status: true }).parse(input);
    await updateShipment(orderId, actor, {
      courier: d.courier || null, trackingId: d.trackingId || null, trackingUrl: d.trackingUrl || null,
      estimatedDelivery: d.estimatedDelivery ? new Date(d.estimatedDelivery) : null, shippingCost: parseShipping(d.shippingCost),
    });
    revalidateOrder(orderId);
    return null;
  }, "Shipping details saved");
}

export async function markCodCollectedAction(orderId: string, reference?: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("payments:reconcile");
    await markCodCollected(orderId, actor, reference?.trim().slice(0, 80) || null);
    revalidateOrder(orderId);
    return null;
  }, "Marked as collected");
}

export async function refundOrderAction(orderId: string, input: { amount: string; reason: string; reference?: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("refunds:manage");
    const amount = rupees.parse(input.amount);
    if (!input.reason?.trim()) throw new AppError("Enter a reason for the refund.");
    await initiateRefund({ orderId, amount, reason: input.reason.trim(), actor, manualReference: input.reference?.trim() || null });
    revalidateOrder(orderId);
    return null;
  }, "Refund initiated");
}

export async function clearAttentionAction(orderId: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("orders:update");
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await db.order.update({ where: { id: orderId }, data: { needsAttention: null } });
    await audit({ actor, action: "order.attention_cleared", entityType: "Order", entityId: orderId, oldValue: { needsAttention: o.needsAttention } });
    revalidateOrder(orderId);
    return null;
  }, "Marked as handled");
}

export async function checkReconciliationAction(paymentId: string): Promise<ActionResult<{ match: boolean; note: string | null }>> {
  return safeAction(async () => {
    const actor = await requirePermission("payments:reconcile");
    const r = await checkReconciliation(paymentId, actor);
    revalidatePath("/admin/payments");
    return { match: r.match, note: r.note };
  });
}

export async function resolveReconciliationAction(paymentId: string): Promise<ActionResult<{ resolved: boolean }>> {
  return safeAction(async () => {
    const actor = await requirePermission("payments:reconcile");
    const r = await resolveReconciliation(paymentId, actor);
    revalidatePath("/admin/payments");
    return { resolved: r.resolved };
  });
}

// ─────────────── Returns ───────────────

export async function decideReturnAction(returnId: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("returns:manage");
    await decideReturn(returnId, actor, decision, note?.trim() || null);
    revalidatePath("/admin/returns");
    return null;
  }, decision === "APPROVED" ? "Return approved" : "Return rejected");
}

export async function receiveReturnAction(returnId: string, input: { conditions: { returnItemId: string; condition: "RESELLABLE" | "DAMAGED" | "RETURN_TO_SUPPLIER" }[]; returnShippingCost?: string }): Promise<ActionResult<{ refundAmount: number }>> {
  return safeAction(async () => {
    const actor = await requirePermission("returns:manage");
    const refundAmount = await receiveReturn(returnId, actor, { conditions: input.conditions, returnShippingCost: input.returnShippingCost ? rupees.parse(input.returnShippingCost) : null });
    revalidatePath("/admin/returns");
    revalidatePath("/admin/inventory");
    return { refundAmount };
  }, "Return received and stock updated");
}

export async function refundReturnAction(returnId: string, input: { amount: string; reference?: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("refunds:manage");
    await refundReturn(returnId, actor, { amount: rupees.parse(input.amount), manualReference: input.reference?.trim() || null });
    revalidatePath("/admin/returns");
    return null;
  }, "Refund initiated");
}

// ─────────────── Customers ───────────────

export async function setCustomerStatusAction(userId: string, input: { status?: "ACTIVE" | "BLOCKED"; codBlocked?: boolean }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.role !== "CUSTOMER") throw new AppError("Only customer accounts can be changed here.");
    const data = { ...(input.status ? { status: input.status } : {}), ...(input.codBlocked !== undefined ? { codBlocked: input.codBlocked } : {}) };
    await db.user.update({ where: { id: userId }, data });
    if (input.status === "BLOCKED") await db.session.deleteMany({ where: { userId } });
    await audit({ actor, action: "customer.update", entityType: "User", entityId: userId, oldValue: { status: u.status, codBlocked: u.codBlocked }, newValue: data });
    revalidatePath(`/admin/customers/${userId}`);
    return null;
  }, "Customer updated");
}

/** Sets how many guaranteed gift-voucher spins an account has waiting (e.g. for a partner creator). */
export async function setVoucherSpinsAction(userId: string, count: number): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n) || n < 0 || n > 20) throw new AppError("Enter a number from 0 to 20.");
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.role !== "CUSTOMER") throw new AppError("Only customer accounts can be selected.");
    await db.user.update({ where: { id: userId }, data: { voucherSpins: n } });
    await audit({ actor, action: "customer.voucherSpins", entityType: "User", entityId: userId, oldValue: { voucherSpins: u.voucherSpins }, newValue: { voucherSpins: n } });
    revalidatePath(`/admin/customers/${userId}`);
    return null;
  }, "Gift-voucher spins updated");
}

/** Saves the gift voucher code you bought for a winner; they see it on the Spin & Win page. */
export async function issueVoucherCodeAction(spinId: string, code: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    const value = (code ?? "").trim();
    if (value.length < 4 || value.length > 60) throw new AppError("Enter the voucher code (4–60 characters).");
    const spin = await db.spinResult.findUnique({ where: { id: String(spinId) } });
    if (!spin || spin.prize !== "GIFT_VOUCHER") throw new AppError("This is not a gift-voucher win.");
    await db.spinResult.update({ where: { id: spin.id }, data: { voucherCode: value, voucherIssuedAt: new Date() } });
    await db.notification.upsert({
      where: { dedupeKey: `gift-voucher:${spin.id}` },
      update: { readAt: null },
      create: {
        audience: "CUSTOMER", userId: spin.userId, event: "GIFT_VOUCHER", dedupeKey: `gift-voucher:${spin.id}`,
        title: "Your gift voucher is ready", body: "Open Spin & Win to see your voucher code.", link: "/spin",
      },
    });
    // The code itself is not written to the audit log.
    await audit({ actor, action: "customer.voucherIssued", entityType: "User", entityId: spin.userId, newValue: { spinId: spin.id, amount: spin.voucherAmount, brand: spin.voucherBrand } });
    revalidatePath(`/admin/customers/${spin.userId}`);
    revalidatePath("/admin/coupons");
    return null;
  }, "Voucher code saved");
}

/** Admin correction of a customer's wallet: a positive amount adds money, a negative one takes it. */
export async function adjustWalletAction(userId: string, input: { rupees: number; note: string }): Promise<ActionResult<{ balance: number }>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    const paise = Math.round(Number(input.rupees) * 100);
    const balance = await adjustWallet(actor, userId, paise, String(input.note ?? ""));
    await audit({ actor, action: "customer.walletAdjust", entityType: "User", entityId: userId, newValue: { amount: paise, note: String(input.note ?? "").slice(0, 200), balance } });
    revalidatePath(`/admin/customers/${userId}`);
    return { balance };
  }, "Wallet updated");
}

export async function addCustomerNoteAction(userId: string, input: { body: string; type: "NOTE" | "COMPLAINT" | "SUPPORT"; orderId?: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    const body = input.body?.trim();
    if (!body) throw new AppError("Write a note first.");
    await db.customerNote.create({ data: { customerId: userId, authorId: actor.id, body: body.slice(0, 2000), type: input.type, orderId: input.orderId || null } });
    if (input.type === "COMPLAINT") await notifyAdmin("ADMIN_COMPLAINT", { key: `note:${Date.now()}`, extra: { customerName: (await db.user.findUnique({ where: { id: userId } }))?.name } });
    revalidatePath(`/admin/customers/${userId}`);
    return null;
  }, "Note added");
}

export async function resolveNoteAction(noteId: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    await requirePermission("customers:manage");
    const n = await db.customerNote.update({ where: { id: noteId }, data: { status: "RESOLVED" } });
    revalidatePath(`/admin/customers/${n.customerId}`);
    return null;
  }, "Marked resolved");
}

// ─────────────── Coupons ───────────────

export async function saveCouponAction(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const actor = await requirePermission("coupons:manage");
    const d = couponSchema.parse(input);
    const payload = {
      code: d.code, description: d.description || null, type: d.type,
      value: d.type === "FIXED" ? Math.round(d.value * 100) : Math.round(d.value),
      minOrder: d.minOrder, maxDiscount: d.type === "PERCENTAGE" ? d.maxDiscount : null,
      expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59+05:30`) : null,
      usageLimit: d.usageLimit, perUserLimit: d.perUserLimit, isActive: d.isActive,
    };
    const clash = await db.coupon.findFirst({ where: { code: d.code, ...(id ? { NOT: { id } } : {}) } });
    if (clash) throw new AppError("A coupon with this code already exists.");
    const before = id ? await db.coupon.findUnique({ where: { id } }) : null;
    const saved = id ? await db.coupon.update({ where: { id }, data: payload }) : await db.coupon.create({ data: payload });
    await audit({ actor, action: id ? "coupon.update" : "coupon.create", entityType: "Coupon", entityId: saved.id, oldValue: before ?? undefined, newValue: payload });
    revalidatePath("/admin/coupons");
    return { id: saved.id };
  }, "Coupon saved");
}

export async function toggleCouponAction(id: string, isActive: boolean): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("coupons:manage");
    await db.coupon.update({ where: { id }, data: { isActive } });
    await audit({ actor, action: isActive ? "coupon.activate" : "coupon.deactivate", entityType: "Coupon", entityId: id });
    revalidatePath("/admin/coupons");
    return null;
  });
}

// ─────────────── Notification centre ───────────────

export async function markAdminNotificationsReadAction(ids?: string[]): Promise<ActionResult<null>> {
  return safeAction(async () => {
    await requirePermission("notifications:view");
    await db.notification.updateMany({ where: { audience: "ADMIN", readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    revalidatePath("/admin", "layout");
    return null;
  });
}

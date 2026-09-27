import "server-only";
import { randomBytes } from "crypto";
import type { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { razorpayConfig } from "@/lib/env";
import { AppError, ForbiddenError, StockError } from "@/lib/errors";
import { notifyAdmin, notifyCustomer } from "@/lib/notifications/dispatch";
import { STATUS_EVENT } from "@/lib/notifications/events";
import { CUSTOMER_CANCELLABLE, ORDER_STATUS_LABEL, canTransition } from "@/lib/order-status";
import { razorpay } from "@/lib/razorpay";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { removePurchasedFromCart } from "./cart";
import { buildCheckout } from "./checkout";
import { checkLowStock, commitStock, releaseOrderStock, reserveStock } from "./inventory";

type Actor = { id: string; email: string } | null;

export async function addOrderEvent(tx: Tx, orderId: string, type: string, message: string, actorId?: string | null) {
  await tx.orderEvent.create({ data: { orderId, type, message, actorId: actorId ?? null } });
}

/** Locks the order row for the rest of the transaction (serialises concurrent webhooks / admin actions). */
export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

function newOrderNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = Array.from(randomBytes(6)).map((b) => alphabet[b % alphabet.length]).join("");
  return `BOT${ymd}${rand}`;
}

export type PlaceOrderInput = {
  addressId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  group?: PaymentMethod | null;
  checkoutKey: string;
  note?: string | null;
};

export type RazorpayCheckoutParams = {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
};

export type PlaceOrderResult = { orderNumber: string; paymentMethod: PaymentMethod; razorpay?: RazorpayCheckoutParams };

export async function placeOrder(user: SessionUser, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  await rateLimit(`place-order:${user.id}`, 10, 60);

  // Idempotency: the same checkout submission returns the same order.
  const existing = await db.order.findUnique({ where: { checkoutKey: input.checkoutKey } });
  if (existing) {
    if (existing.userId !== user.id) throw new ForbiddenError();
    if (existing.paymentMethod === "ONLINE" && existing.status === "PENDING_PAYMENT") {
      return { orderNumber: existing.orderNumber, paymentMethod: "ONLINE", razorpay: await createPaymentAttempt(existing.id, user) };
    }
    return { orderNumber: existing.orderNumber, paymentMethod: existing.paymentMethod };
  }

  const state = await buildCheckout({
    user, group: input.group, addressId: input.addressId, couponCode: input.couponCode, paymentMethod: input.paymentMethod,
  });
  const { settings, lines, address, availability, totals, coupon } = state;

  if (lines.length === 0) throw new AppError("Your cart is empty.");
  if (!address || address.id !== input.addressId) throw new AppError("Please choose a delivery address.");
  if (state.problems.length > 0) throw new AppError(state.problems[0], "CHECKOUT_PROBLEM", 409);
  if (input.couponCode && !coupon) throw new AppError(state.couponError ?? "Invalid coupon.");
  if (availability.conflict) throw new AppError(availability.message ?? "These products cannot be ordered together.", "PAYMENT_CONFLICT", 409);
  const verdict = input.paymentMethod === "ONLINE" ? availability.online : availability.cod;
  if (!verdict.allowed) throw new AppError(verdict.reason ?? "This payment method is not available for your order.", "PAYMENT_NOT_ALLOWED", 409);
  if (input.paymentMethod === "ONLINE" && totals.total < 100) throw new AppError("Online payment requires a minimum of ₹1.");

  const variants = await db.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const isCod = input.paymentMethod === "COD";
  const reserveNow = isCod || settings.inventoryPolicy === "RESERVE_AT_CHECKOUT";

  const order = await db.$transaction(async (tx) => {
    const orderNumber = newOrderNumber();
    const created = await tx.order.create({
      data: {
        orderNumber,
        checkoutKey: input.checkoutKey,
        userId: user.id,
        customerName: address.name,
        email: user.email,
        phone: address.phone,
        shippingAddress: {
          name: address.name, phone: address.phone, line1: address.line1, line2: address.line2, landmark: address.landmark,
          city: address.city, state: address.state, pincode: address.pincode,
        },
        pincode: address.pincode,
        city: address.city,
        state: address.state,
        status: isCod ? "CONFIRMED" : "PENDING_PAYMENT",
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        subtotal: totals.subtotal,
        discount: totals.discount,
        shippingFee: totals.shippingFee,
        codFee: totals.codFee,
        total: totals.total,
        gstAmount: totals.gstAmount,
        couponCode: coupon?.code ?? null,
        couponId: coupon?.id ?? null,
        customerNote: input.note?.slice(0, 500) || null,
        confirmedAt: isCod ? new Date() : null,
        paymentExpiresAt: isCod ? null : new Date(Date.now() + settings.paymentWindowMinutes * 60000),
        items: {
          create: lines.map((l) => {
            const v = byId.get(l.variantId)!;
            return {
              productId: v.productId,
              variantId: v.id,
              name: v.product.name,
              variantName: v.isDefault ? null : v.name,
              sku: v.sku,
              imageUrl: l.imageUrl,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              unitMrp: l.unitMrp,
              unitCost: v.product.costPrice,
              unitShippingCost: v.product.shippingCost,
              unitOtherCost: v.product.otherCost,
              gstRate: v.product.gstRate,
              lineTotal: l.unitPrice * l.quantity,
            };
          }),
        },
      },
    });

    if (coupon) {
      const inc = await tx.coupon.updateMany({
        where: { id: coupon.id, isActive: true, OR: [{ usageLimit: null }, { usedCount: { lt: db.coupon.fields.usageLimit } }] },
        data: { usedCount: { increment: 1 } },
      });
      if (inc.count !== 1) throw new AppError("This coupon has just reached its usage limit.");
      await tx.couponUsage.create({ data: { couponId: coupon.id, userId: user.id, orderId: created.id } });
    }

    const stockLines = lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, name: l.name }));
    if (reserveNow) {
      await reserveStock(tx, stockLines, created.id);
      if (isCod) await commitStock(tx, stockLines);
      await tx.order.update({ where: { id: created.id }, data: { stockState: isCod ? "COMMITTED" : "RESERVED" } });
    }

    await tx.payment.create({
      data: {
        orderId: created.id, userId: user.id, method: input.paymentMethod,
        provider: isCod ? "cod" : "razorpay", amount: totals.total, status: "PENDING",
      },
    });

    await addOrderEvent(tx, created.id, "ORDER_PLACED", `Order placed — ${isCod ? "Cash on Delivery" : "awaiting online payment"}.`, user.id);
    if (isCod) await addOrderEvent(tx, created.id, "ORDER_CONFIRMED", "Order confirmed (COD). Payment to be collected on delivery.");
    return created;
  }, { isolationLevel: "ReadCommitted", timeout: 20000 });

  if (isCod) {
    await removePurchasedFromCart(user.id, lines.map((l) => l.variantId));
    await notifyCustomer("ORDER_CREATED", { orderId: order.id });
    await notifyAdmin("ADMIN_COD_ORDER", { orderId: order.id });
    await checkLowStock(lines.map((l) => l.variantId));
    return { orderNumber: order.orderNumber, paymentMethod: "COD" };
  }

  try {
    const params = await createPaymentAttempt(order.id, user);
    return { orderNumber: order.orderNumber, paymentMethod: "ONLINE", razorpay: params };
  } catch (err) {
    await cancelOrder(order.id, null, "Could not start online payment", { system: true });
    throw err;
  }
}

/**
 * Creates a Razorpay order for an online order awaiting payment (first attempt or a retry after failure).
 * Re-reserves stock if the earlier reservation was released.
 */
export async function createPaymentAttempt(orderId: string, user: SessionUser): Promise<RazorpayCheckoutParams> {
  const cfg = razorpayConfig();
  if (!cfg.configured) throw new AppError("Online payment is not available right now. Please choose Cash on Delivery if offered.", "GATEWAY_NOT_CONFIGURED", 503);
  const settings = await getSettings();
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, payments: { orderBy: { createdAt: "desc" } } } });
  if (!order || order.userId !== user.id) throw new ForbiddenError();
  if (order.paymentMethod !== "ONLINE" || order.status !== "PENDING_PAYMENT") {
    throw new AppError("This order is not awaiting payment.");
  }
  if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) {
    throw new AppError("The payment window for this order has expired. Please place the order again.");
  }

  // Reuse a still-pending attempt that already has a Razorpay order.
  let attempt = order.payments.find((p) => p.status === "PENDING" && p.razorpayOrderId);
  if (!attempt) {
    const pendingWithout = order.payments.find((p) => p.status === "PENDING" && !p.razorpayOrderId);
    const rzpOrder = await razorpay.createOrder({
      amount: order.total,
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });
    attempt = await db.$transaction(async (tx) => {
      await lockOrder(tx, order.id);
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      if (fresh.stockState === "RELEASED" && settings.inventoryPolicy === "RESERVE_AT_CHECKOUT") {
        await reserveStock(tx, order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, name: i.name })), order.id);
        await tx.order.update({ where: { id: order.id }, data: { stockState: "RESERVED" } });
      }
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PENDING", paymentExpiresAt: new Date(Date.now() + settings.paymentWindowMinutes * 60000) } });
      if (pendingWithout) {
        return tx.payment.update({ where: { id: pendingWithout.id }, data: { razorpayOrderId: rzpOrder.id, gatewayStatus: rzpOrder.status } });
      }
      await addOrderEvent(tx, order.id, "PAYMENT_RETRY", "New payment attempt started.", user.id);
      return tx.payment.create({
        data: { orderId: order.id, userId: user.id, method: "ONLINE", amount: order.total, razorpayOrderId: rzpOrder.id, gatewayStatus: rzpOrder.status },
      });
    });
  }

  return {
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || cfg.keyId,
    razorpayOrderId: attempt.razorpayOrderId!,
    amount: order.total,
    currency: "INR",
    name: settings.storeName,
    description: `Order ${order.orderNumber}`,
    prefill: { name: order.customerName, email: order.email, contact: order.phone },
  };
}

/**
 * Cancels an order: releases stock and coupon usage, cancels pending payments and — if the customer
 * already paid online — initiates a Razorpay refund automatically.
 */
export async function cancelOrder(
  orderId: string,
  actor: Actor,
  reason: string,
  opts: { byCustomerId?: string; system?: boolean } = {},
) {
  let refundAmount = 0;
  let paidPaymentId: string | null = null;
  const result = await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true, couponUsage: true } });
    if (opts.byCustomerId) {
      if (order.userId !== opts.byCustomerId) throw new ForbiddenError();
      if (!CUSTOMER_CANCELLABLE.includes(order.status)) throw new AppError("This order can no longer be cancelled.");
    } else if (!opts.system && !canTransition(order.status, "CANCELLED")) {
      throw new AppError(`An order that is ${ORDER_STATUS_LABEL[order.status].toLowerCase()} cannot be cancelled.`);
    }
    if (order.status === "CANCELLED") return null;

    await releaseOrderStock(tx, orderId, `Order cancelled: ${reason}`);
    if (order.couponUsage) {
      await tx.couponUsage.delete({ where: { id: order.couponUsage.id } });
      await tx.coupon.update({ where: { id: order.couponUsage.couponId }, data: { usedCount: { decrement: 1 } } });
    }
    for (const p of order.payments) {
      if (p.status === "PENDING" || p.status === "AUTHORIZED") {
        await tx.payment.update({ where: { id: p.id }, data: { status: "CANCELLED" } });
      }
      if (p.status === "PAID" && p.method === "ONLINE") {
        paidPaymentId = p.id;
        refundAmount = p.amount - p.refundedAmount;
      }
    }
    const paymentStatus = paidPaymentId ? order.paymentStatus : order.paymentStatus === "PAID" ? "PAID" : "CANCELLED";
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelReason: reason, cancelledAt: new Date(), paymentStatus },
    });
    await addOrderEvent(tx, orderId, "ORDER_CANCELLED", `Order cancelled${opts.byCustomerId ? " by customer" : ""}: ${reason}`, actor?.id ?? opts.byCustomerId);
    if (actor) await audit({ actor, action: "order.cancel", entityType: "Order", entityId: orderId, oldValue: { status: order.status }, newValue: { status: "CANCELLED", reason } }, tx);
    return { order: updated, previousStatus: order.status };
  });

  if (!result) return;
  await notifyCustomer("ORDER_CANCELLED", { orderId, extra: { reason } });
  if (paidPaymentId && refundAmount > 0) {
    const { initiateRefund } = await import("./refunds");
    try {
      await initiateRefund({ orderId, amount: refundAmount, reason: `Order cancelled: ${reason}`, actor, system: !actor });
    } catch (err) {
      console.error("[cancel] auto refund failed", err);
      await db.order.update({ where: { id: orderId }, data: { needsAttention: "Cancelled after online payment — automatic refund failed. Refund manually." } });
      await notifyAdmin("ADMIN_ATTENTION", { orderId, key: "refund-failed", extra: { reason: "automatic refund failed after cancellation" } });
    }
  }
}

export type StatusUpdateInput = {
  status: OrderStatus;
  courier?: string | null;
  trackingId?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: Date | null;
  shippingCost?: number | null;
  note?: string | null;
};

/** Admin/supplier fulfilment update following the order state machine. */
export async function updateOrderStatus(orderId: string, actor: { id: string; email: string }, input: StatusUpdateInput) {
  if (input.status === "CANCELLED") return cancelOrder(orderId, actor, input.note || "Cancelled by store");
  const settings = await getSettings();
  const changed = await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
    if (!canTransition(order.status, input.status)) {
      throw new AppError(`Cannot move an order from "${ORDER_STATUS_LABEL[order.status]}" to "${ORDER_STATUS_LABEL[input.status]}".`);
    }
    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: input.status };
    if (input.status === "DELIVERED") data.deliveredAt = now;

    // Shipment details
    const shipmentData = {
      courier: input.courier ?? undefined,
      trackingId: input.trackingId ?? undefined,
      trackingUrl: input.trackingUrl ?? undefined,
      estimatedDelivery: input.estimatedDelivery ?? undefined,
      actualCost: input.shippingCost ?? undefined,
      ...(input.status === "SHIPPED" ? { shippedAt: now } : {}),
      ...(input.status === "DELIVERED" ? { deliveredAt: now } : {}),
    };
    await tx.shippingInformation.upsert({ where: { orderId }, update: shipmentData, create: { orderId, ...shipmentData } });

    if (input.status === "RTO") {
      // Parcel came back undelivered: goods return to sellable stock; uncollected COD is cancelled.
      await releaseOrderStock(tx, orderId, "Returned to origin (RTO)");
      if (order.paymentMethod === "COD") {
        data.paymentStatus = "CANCELLED";
        for (const p of order.payments.filter((p) => p.status === "PENDING")) {
          await tx.payment.update({ where: { id: p.id }, data: { status: "CANCELLED" } });
        }
      } else if (order.paymentStatus === "PAID") {
        data.needsAttention = "RTO on a prepaid order — decide on refund.";
      }
    }

    if (input.status === "DELIVERED" && order.paymentMethod === "COD" && settings.codMarkPaidOnDelivery && order.paymentStatus === "PENDING") {
      data.paymentStatus = "PAID";
      data.paidAt = now;
      for (const p of order.payments.filter((p) => p.status === "PENDING")) {
        await tx.payment.update({ where: { id: p.id }, data: { status: "PAID", paidAt: now, gatewayStatus: "cod_collected" } });
      }
    }

    await tx.order.update({ where: { id: orderId }, data });
    const tracking = input.trackingId ? ` (${input.courier ?? "courier"} ${input.trackingId})` : "";
    await addOrderEvent(tx, orderId, input.status, `${ORDER_STATUS_LABEL[input.status]}${tracking}${input.note ? ` — ${input.note}` : ""}`, actor.id);
    await audit({ actor, action: "order.status_change", entityType: "Order", entityId: orderId, oldValue: { status: order.status }, newValue: { status: input.status, courier: input.courier, trackingId: input.trackingId } }, tx);
    return { from: order.status };
  });

  const event = STATUS_EVENT[input.status];
  if (event) await notifyCustomer(event, { orderId });
  if (input.status === "RTO") await notifyAdmin("ADMIN_ATTENTION", { orderId, key: "rto", extra: { reason: "returned to origin" } });
  return changed;
}

/** Updates courier / tracking details without changing status. */
export async function updateShipment(orderId: string, actor: { id: string; email: string }, input: Omit<StatusUpdateInput, "status">) {
  const before = await db.shippingInformation.findUnique({ where: { orderId } });
  const data = {
    courier: input.courier ?? null,
    trackingId: input.trackingId ?? null,
    trackingUrl: input.trackingUrl ?? null,
    estimatedDelivery: input.estimatedDelivery ?? null,
    actualCost: input.shippingCost ?? null,
  };
  await db.shippingInformation.upsert({ where: { orderId }, update: data, create: { orderId, ...data } });
  await audit({ actor, action: "order.shipment_update", entityType: "Order", entityId: orderId, oldValue: before, newValue: data });
}

/**
 * Cancels online orders whose payment window elapsed. Before cancelling, it asks Razorpay whether a payment
 * was actually captured, so a late webhook can never leave a paid order cancelled.
 */
export async function expireStaleOrders(limit = 25) {
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentExpiresAt: { lt: new Date() } },
    include: { payments: true },
    take: limit,
    orderBy: { paymentExpiresAt: "asc" },
  });
  let expired = 0;
  for (const order of stale) {
    const { syncPaymentsFromGateway } = await import("./payments");
    const confirmed = await syncPaymentsFromGateway(order.id).catch((e) => {
      console.error("[expire] gateway check failed", order.orderNumber, e);
      return "error" as const;
    });
    if (confirmed === "paid" || confirmed === "error") continue;
    await cancelOrder(order.id, null, "Payment not completed in time", { system: true });
    expired++;
  }
  return expired;
}

/** Throws StockError-friendly info for UI. */
export function isStockError(err: unknown): err is StockError {
  return err instanceof StockError;
}

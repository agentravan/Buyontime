import "server-only";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sha256, type SessionUser } from "@/lib/auth";
import { razorpayConfig } from "@/lib/env";
import { AppError, ForbiddenError } from "@/lib/errors";
import { notifyAdmin, notifyCustomer } from "@/lib/notifications/dispatch";
import { razorpay, verifyPaymentSignature, verifyWebhookSignature, type RzpPayment, type RzpRefund } from "@/lib/razorpay";
import { rateLimit } from "@/lib/rate-limit";
import { removePurchasedFromCart } from "./cart";
import { checkLowStock, commitStock, reserveStock } from "./inventory";
import { addOrderEvent, lockOrder } from "./orders";

/**
 * Payment state machine. Every source of truth — the browser callback (after signature verification),
 * Razorpay webhooks, reconciliation and the expiry job — funnels through `applyGatewayPayment`, which:
 *   • locks the payment + order rows, so concurrent webhooks are serialised,
 *   • is idempotent (re-applying the same captured payment is a no-op),
 *   • never downgrades a PAID payment,
 *   • commits inventory exactly once (guarded by the order's stockState).
 */

const PAID_LIKE: PaymentStatus[] = ["PAID", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"];

type ApplyOutcome =
  | { kind: "ignored"; reason: string }
  | { kind: "duplicate" }
  | { kind: "paid"; orderId: string; paymentId: string; confirmed: boolean; oversold: boolean; variantIds: string[]; userId: string }
  | { kind: "authorized"; orderId: string; paymentId: string; razorpayPaymentId: string; amount: number }
  | { kind: "failed"; orderId: string; razorpayPaymentId: string; reason: string }
  | { kind: "attention"; orderId: string; reason: string };

type Source = "verify" | "webhook" | "reconcile" | "expiry-check";

async function lockPayment(tx: Tx, razorpayOrderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment" WHERE "razorpayOrderId" = ${razorpayOrderId} FOR UPDATE`;
  return rows[0]?.id ?? null;
}

export async function applyGatewayPayment(p: RzpPayment, source: Source, actorId?: string | null): Promise<ApplyOutcome> {
  if (!p.order_id) return { kind: "ignored", reason: "payment has no order_id" };

  const outcome = await db.$transaction(async (tx): Promise<ApplyOutcome> => {
    const paymentRowId = await lockPayment(tx, p.order_id!);
    if (!paymentRowId) return { kind: "ignored", reason: `no local payment for ${p.order_id}` };
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentRowId } });
    await lockOrder(tx, payment.orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { items: true } });
    const snapshot = JSON.parse(JSON.stringify(p)) as Prisma.InputJsonValue;

    if (p.status === "captured" || (p.status === "refunded" && !PAID_LIKE.includes(payment.status))) {
      if (PAID_LIKE.includes(payment.status)) {
        if (payment.razorpayPaymentId === p.id) return { kind: "duplicate" };
        // A second successful payment for the same order — must be refunded, never silently absorbed.
        await tx.order.update({ where: { id: order.id }, data: { needsAttention: `Duplicate payment ${p.id} captured for this order — refund it from Razorpay.` } });
        await addOrderEvent(tx, order.id, "DUPLICATE_PAYMENT", `Additional payment ${p.id} captured (${source}). Needs refund.`);
        return { kind: "attention", orderId: order.id, reason: `duplicate payment ${p.id}` };
      }
      if (p.amount !== payment.amount) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { reconciliationStatus: "MISMATCH", reconciliationNote: `Gateway amount ${p.amount} ≠ expected ${payment.amount}`, gatewaySnapshot: snapshot },
        });
        await tx.order.update({ where: { id: order.id }, data: { needsAttention: "Payment amount mismatch — review before fulfilment." } });
        return { kind: "attention", orderId: order.id, reason: "amount mismatch" };
      }

      const now = new Date();
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          razorpayPaymentId: p.id,
          gatewayStatus: p.status,
          gatewayMethod: p.method ?? null,
          gatewayFee: typeof p.fee === "number" ? p.fee : null,
          failureReason: null,
          paidAt: now,
          gatewaySnapshot: snapshot,
          ...(source === "reconcile" ? { reconciliationStatus: "RESOLVED" as const } : {}),
        },
      });

      const lines = order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, name: i.name }));
      let oversold = false;
      let confirmed = false;
      const orderData: Prisma.OrderUpdateInput = { paymentStatus: "PAID", paidAt: now };

      if (order.status === "PENDING_PAYMENT" || (order.status === "CANCELLED" && order.cancelReason === "Payment not completed in time")) {
        try {
          if (order.stockState === "RESERVED") {
            await commitStock(tx, lines);
          } else {
            await tx.$executeRaw`SAVEPOINT stock_attempt`;
            try {
              await reserveStock(tx, lines, order.id);
              await commitStock(tx, lines);
              await tx.$executeRaw`RELEASE SAVEPOINT stock_attempt`;
            } catch (e) {
              await tx.$executeRaw`ROLLBACK TO SAVEPOINT stock_attempt`;
              throw e;
            }
          }
          orderData.stockState = "COMMITTED";
          orderData.status = "CONFIRMED";
          orderData.confirmedAt = now;
          orderData.cancelReason = null;
          orderData.cancelledAt = null;
          confirmed = true;
        } catch {
          oversold = true;
          orderData.status = "CANCELLED";
          orderData.cancelReason = "Out of stock when payment completed";
          orderData.cancelledAt = order.cancelledAt ?? now;
          orderData.needsAttention = "Paid but stock was unavailable — refund initiated automatically.";
        }
      } else if (order.status === "CANCELLED") {
        orderData.needsAttention = "Payment received for a cancelled order — refund initiated automatically.";
        oversold = true;
      }
      await tx.order.update({ where: { id: order.id }, data: orderData });
      await addOrderEvent(tx, order.id, "PAYMENT_CONFIRMED", `Payment ${p.id} received${p.method ? ` via ${p.method}` : ""} (verified by ${source === "verify" ? "signature + gateway" : source}).`, actorId);
      if (confirmed) await addOrderEvent(tx, order.id, "ORDER_CONFIRMED", "Order confirmed.");
      return { kind: "paid", orderId: order.id, paymentId: payment.id, confirmed, oversold, variantIds: lines.map((l) => l.variantId), userId: order.userId };
    }

    if (p.status === "authorized") {
      if (PAID_LIKE.includes(payment.status)) return { kind: "duplicate" };
      if (payment.status === "AUTHORIZED" && payment.razorpayPaymentId === p.id) {
        return { kind: "authorized", orderId: order.id, paymentId: payment.id, razorpayPaymentId: p.id, amount: p.amount };
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "AUTHORIZED", razorpayPaymentId: p.id, gatewayStatus: p.status, gatewayMethod: p.method ?? null, gatewaySnapshot: snapshot },
      });
      if (order.status === "PENDING_PAYMENT") await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "AUTHORIZED" } });
      return { kind: "authorized", orderId: order.id, paymentId: payment.id, razorpayPaymentId: p.id, amount: p.amount };
    }

    if (p.status === "failed") {
      if (PAID_LIKE.includes(payment.status)) return { kind: "duplicate" };
      const reason = p.error_description || "Payment was declined";
      const alreadyRecorded = payment.status === "FAILED" && payment.gatewaySnapshot && (payment.gatewaySnapshot as { id?: string }).id === p.id;
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", gatewayStatus: "failed", failureReason: reason.slice(0, 300), gatewaySnapshot: snapshot },
      });
      if (order.status === "PENDING_PAYMENT") await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
      if (alreadyRecorded) return { kind: "duplicate" };
      await addOrderEvent(tx, order.id, "PAYMENT_FAILED", `Payment attempt ${p.id} failed: ${reason}`);
      return { kind: "failed", orderId: order.id, razorpayPaymentId: p.id, reason };
    }

    return { kind: "ignored", reason: `unhandled payment status ${p.status}` };
  }, { timeout: 20000 });

  // Side effects after commit (notifications are themselves idempotent).
  if (outcome.kind === "paid") {
    if (outcome.confirmed) {
      await removePurchasedFromCart(outcome.userId, outcome.variantIds);
      await notifyCustomer("PAYMENT_SUCCESS", { orderId: outcome.orderId, key: outcome.paymentId });
      await notifyAdmin("ADMIN_PAYMENT_RECEIVED", { orderId: outcome.orderId, key: outcome.paymentId });
      await notifyAdmin("ADMIN_NEW_ORDER", { orderId: outcome.orderId });
      await checkLowStock(outcome.variantIds);
    }
    if (outcome.oversold) {
      await notifyAdmin("ADMIN_ATTENTION", { orderId: outcome.orderId, key: `oversold:${outcome.paymentId}`, extra: { reason: "paid but could not be fulfilled — auto refund" } });
      const { initiateRefund } = await import("./refunds");
      const pay = await db.payment.findUniqueOrThrow({ where: { id: outcome.paymentId } });
      await initiateRefund({ orderId: outcome.orderId, amount: pay.amount - pay.refundedAmount, reason: "Item unavailable after payment", system: true })
        .catch((e) => console.error("[payments] auto refund failed", e));
    }
  } else if (outcome.kind === "authorized") {
    // Capture authorised payments so money is actually collected (no-op for auto-capture accounts).
    try {
      const captured = await razorpay.capturePayment(outcome.razorpayPaymentId, outcome.amount);
      if (captured.status === "captured") return applyGatewayPayment(captured, source, actorId);
    } catch (err) {
      console.error("[payments] capture failed (webhook will retry state)", err);
    }
  } else if (outcome.kind === "failed") {
    await notifyCustomer("PAYMENT_FAILED", { orderId: outcome.orderId, key: outcome.razorpayPaymentId, extra: { reason: outcome.reason } });
    await notifyAdmin("ADMIN_PAYMENT_FAILED", { orderId: outcome.orderId, key: outcome.razorpayPaymentId, extra: { reason: outcome.reason } });
  } else if (outcome.kind === "attention") {
    await notifyAdmin("ADMIN_ATTENTION", { orderId: outcome.orderId, key: sha256(outcome.reason).slice(0, 12), extra: { reason: outcome.reason } });
  }
  return outcome;
}

/**
 * Browser callback after Razorpay Checkout. The signature proves the response came from Razorpay; the
 * payment is then re-fetched from the Razorpay API so the amount/status are never taken from the browser.
 */
export async function verifyCheckoutPayment(
  user: SessionUser,
  input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  await rateLimit(`verify:${user.id}`, 20, 60);
  const payment = await db.payment.findUnique({ where: { razorpayOrderId: input.razorpay_order_id }, include: { order: true } });
  if (!payment || payment.userId !== user.id) throw new ForbiddenError("Payment not found.");

  const valid = verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature);
  if (!valid) {
    await addOrderEventStandalone(payment.orderId, "PAYMENT_VERIFICATION_FAILED", "Checkout signature verification failed — payment NOT marked as paid.");
    throw new AppError("We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded.", "VERIFICATION_FAILED", 400);
  }
  await db.payment.update({ where: { id: payment.id }, data: { signatureVerified: true } });

  let gatewayPayment: RzpPayment | null = null;
  try {
    gatewayPayment = await razorpay.fetchPayment(input.razorpay_payment_id);
  } catch (err) {
    console.error("[verify] fetch payment failed; webhook will confirm", err);
  }
  if (gatewayPayment && gatewayPayment.order_id !== input.razorpay_order_id) {
    throw new AppError("Payment does not belong to this order.", "VERIFICATION_FAILED", 400);
  }
  if (gatewayPayment) await applyGatewayPayment(gatewayPayment, "verify", user.id);

  const fresh = await db.order.findUniqueOrThrow({ where: { id: payment.orderId } });
  return { orderNumber: fresh.orderNumber, paymentStatus: fresh.paymentStatus, status: fresh.status };
}

async function addOrderEventStandalone(orderId: string, type: string, message: string) {
  await db.orderEvent.create({ data: { orderId, type, message } });
}

/** Failure reported by Razorpay Checkout in the browser. Can only move a payment to FAILED, never to PAID. */
export async function recordClientPaymentFailure(
  user: SessionUser,
  input: { razorpay_order_id: string; razorpay_payment_id?: string; description?: string },
) {
  await rateLimit(`fail:${user.id}`, 20, 60);
  const payment = await db.payment.findUnique({ where: { razorpayOrderId: input.razorpay_order_id }, include: { order: true } });
  if (!payment || payment.userId !== user.id) throw new ForbiddenError("Payment not found.");
  if (payment.status !== "PENDING" && payment.status !== "FAILED") return { orderNumber: payment.order.orderNumber };
  await applyGatewayPayment(
    {
      id: input.razorpay_payment_id || `client_${payment.id}`,
      order_id: input.razorpay_order_id,
      amount: payment.amount,
      currency: "INR",
      status: "failed",
      error_description: (input.description || "Payment failed or was cancelled").slice(0, 200),
    },
    "verify",
    user.id,
  );
  return { orderNumber: payment.order.orderNumber };
}

/** Asks Razorpay for the latest state of an order's payments and applies it (used before expiring orders). */
export async function syncPaymentsFromGateway(orderId: string): Promise<"paid" | "unpaid"> {
  if (!razorpayConfig().configured) return "unpaid";
  const payments = await db.payment.findMany({ where: { orderId, razorpayOrderId: { not: null } } });
  for (const pay of payments) {
    const { items } = await razorpay.fetchOrderPayments(pay.razorpayOrderId!);
    const captured = items.find((i) => i.status === "captured" || i.status === "refunded");
    const authorized = items.find((i) => i.status === "authorized");
    if (captured) {
      await applyGatewayPayment(captured, "expiry-check");
      return "paid";
    }
    if (authorized) {
      await applyGatewayPayment(authorized, "expiry-check");
      const again = await db.payment.findUniqueOrThrow({ where: { id: pay.id } });
      if (again.status === "PAID") return "paid";
    }
  }
  return "unpaid";
}

// ─────────────────────────────── Webhooks ───────────────────────────────

type WebhookBody = {
  event: string;
  payload: {
    payment?: { entity: RzpPayment };
    refund?: { entity: RzpRefund };
    order?: { entity: { id: string } };
  };
};

export type WebhookResult = { status: number; body: { ok: boolean; duplicate?: boolean; ignored?: boolean; error?: string } };

/** Verifies and processes a Razorpay webhook exactly once per event id. */
export async function handleRazorpayWebhook(rawBody: string, signature: string | null, eventIdHeader: string | null): Promise<WebhookResult> {
  if (!razorpayConfig().webhookConfigured) return { status: 503, body: { ok: false, error: "webhook secret not configured" } };
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    console.warn("[webhook] invalid signature");
    return { status: 400, body: { ok: false, error: "invalid signature" } };
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return { status: 400, body: { ok: false, error: "invalid json" } };
  }
  const eventId = eventIdHeader || `sha256:${sha256(rawBody)}`;

  // Idempotency gate: the unique eventId makes a replayed event a no-op.
  const existing = await db.webhookEvent.findUnique({ where: { eventId } });
  if (existing) {
    const stuck = existing.status === "RECEIVED" && existing.receivedAt < new Date(Date.now() - 120000);
    if (existing.status === "PROCESSED" || existing.status === "IGNORED" || (existing.status === "RECEIVED" && !stuck)) {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
  } else {
    try {
      await db.webhookEvent.create({ data: { eventId, event: body.event, payload: JSON.parse(rawBody) as Prisma.InputJsonValue } });
    } catch (err) {
      if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
        return { status: 200, body: { ok: true, duplicate: true } };
      }
      throw err;
    }
  }

  try {
    let ignored = false;
    switch (body.event) {
      case "payment.authorized":
      case "payment.captured":
      case "payment.failed":
      case "order.paid": {
        const entity = body.payload.payment?.entity;
        if (!entity) { ignored = true; break; }
        const out = await applyGatewayPayment(entity, "webhook");
        ignored = out.kind === "ignored";
        break;
      }
      case "refund.created":
      case "refund.processed":
      case "refund.failed": {
        const entity = body.payload.refund?.entity;
        if (!entity) { ignored = true; break; }
        const { applyRefundUpdate } = await import("./refunds");
        const out = await applyRefundUpdate(entity, body.event);
        ignored = out === "ignored";
        break;
      }
      default:
        ignored = true;
    }
    await db.webhookEvent.update({ where: { eventId }, data: { status: ignored ? "IGNORED" : "PROCESSED", processedAt: new Date(), error: null } });
    return { status: 200, body: { ok: true, ignored } };
  } catch (err) {
    console.error("[webhook] processing failed", body.event, err);
    await db.webhookEvent.update({ where: { eventId }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "error" } });
    // 500 makes Razorpay retry later.
    return { status: 500, body: { ok: false, error: "processing failed" } };
  }
}

// ─────────────────────────────── COD & reconciliation ───────────────────────────────

export async function markCodCollected(orderId: string, actor: { id: string; email: string }, reference?: string | null) {
  await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
    if (order.paymentMethod !== "COD") throw new AppError("Only Cash on Delivery orders can be marked as collected.");
    if (order.paymentStatus === "PAID") return;
    if (!["DELIVERED", "OUT_FOR_DELIVERY", "SHIPPED"].includes(order.status)) {
      throw new AppError("COD can be marked collected only once the order has been shipped/delivered.");
    }
    const now = new Date();
    const pay = order.payments.find((p) => p.method === "COD");
    if (pay) await tx.payment.update({ where: { id: pay.id }, data: { status: "PAID", paidAt: now, gatewayStatus: "cod_collected", reconciliationNote: reference ?? null } });
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID", paidAt: now } });
    await addOrderEvent(tx, orderId, "COD_COLLECTED", `Cash on Delivery amount collected${reference ? ` (ref ${reference})` : ""}.`, actor.id);
    await audit({ actor, action: "payment.cod_collected", entityType: "Order", entityId: orderId, oldValue: { paymentStatus: order.paymentStatus }, newValue: { paymentStatus: "PAID", reference } }, tx);
  });
}

function expectedStatusFromGateway(items: RzpPayment[]): { status: PaymentStatus; payment: RzpPayment | null; label: string } {
  const captured = items.find((i) => i.status === "captured" || i.status === "refunded");
  if (captured) {
    const refunded = captured.amount_refunded ?? 0;
    if (refunded >= captured.amount) return { status: "REFUNDED", payment: captured, label: "REFUNDED" };
    if (refunded > 0) return { status: "PARTIALLY_REFUNDED", payment: captured, label: "PARTIALLY REFUNDED" };
    return { status: "PAID", payment: captured, label: "PAID" };
  }
  const authorized = items.find((i) => i.status === "authorized");
  if (authorized) return { status: "AUTHORIZED", payment: authorized, label: "AUTHORIZED" };
  const failed = items.find((i) => i.status === "failed");
  if (failed) return { status: "FAILED", payment: failed, label: "FAILED" };
  return { status: "PENDING", payment: null, label: "NO PAYMENT" };
}

/** Compares our record with Razorpay and flags mismatches. Never changes financial fields. */
export async function checkReconciliation(paymentId: string, actor: { id: string; email: string }) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.method !== "ONLINE" || !payment.razorpayOrderId) throw new AppError("Only online payments can be reconciled with Razorpay.");
  const { items } = await razorpay.fetchOrderPayments(payment.razorpayOrderId);
  const expected = expectedStatusFromGateway(items);
  const dbComparable = payment.status === "REFUND_PENDING" ? "PAID" : payment.status;
  const gatewayComparable = expected.status;
  const match = dbComparable === gatewayComparable || (payment.status === "CANCELLED" && gatewayComparable === "PENDING") || (payment.status === "FAILED" && gatewayComparable === "PENDING");
  const note = match ? null : `Razorpay = ${expected.label}, Database = ${payment.status}`;
  await db.payment.update({
    where: { id: paymentId },
    data: {
      reconciliationStatus: match ? "OK" : "MISMATCH",
      reconciliationNote: note,
      lastCheckedAt: new Date(),
      gatewaySnapshot: JSON.parse(JSON.stringify({ items })) as Prisma.InputJsonValue,
    },
  });
  await audit({ actor, action: "payment.reconciliation_check", entityType: "Payment", entityId: paymentId, newValue: { result: match ? "OK" : "MISMATCH", note } });
  if (!match) await notifyAdmin("ADMIN_ATTENTION", { orderId: payment.orderId, key: `recon:${paymentId}:${expected.label}`, extra: { reason: `payment reconciliation required (${note})` } });
  return { match, note, gateway: expected.label, database: payment.status };
}

/**
 * Admin-confirmed resolution: applies Razorpay's verified state through the normal state machine
 * (with full audit trail). Refund differences must be handled from the refunds screen.
 */
export async function resolveReconciliation(paymentId: string, actor: { id: string; email: string }) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.reconciliationStatus !== "MISMATCH" || !payment.razorpayOrderId) throw new AppError("There is no open mismatch for this payment.");
  const { items } = await razorpay.fetchOrderPayments(payment.razorpayOrderId);
  const expected = expectedStatusFromGateway(items);
  if (!expected.payment) throw new AppError("Razorpay has no payment for this order; nothing to apply.");
  const before = { status: payment.status, razorpayPaymentId: payment.razorpayPaymentId };
  const outcome = await applyGatewayPayment(expected.payment, "reconcile", actor.id);
  const after = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const resolved = after.status === expected.status || (expected.status === "PAID" && PAID_LIKE.includes(after.status));
  await db.payment.update({
    where: { id: paymentId },
    data: { reconciliationStatus: resolved ? "RESOLVED" : "MISMATCH", reconciliationNote: resolved ? `Resolved by ${actor.email}` : `Still differs: Razorpay = ${expected.label}, Database = ${after.status}` },
  });
  await audit({ actor, action: "payment.reconciliation_resolve", entityType: "Payment", entityId: paymentId, oldValue: before, newValue: { status: after.status, razorpayPaymentId: after.razorpayPaymentId, outcome: outcome.kind } });
  return { resolved, status: after.status };
}

import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { notifyAdmin, notifyCustomer } from "@/lib/notifications/dispatch";
import { razorpay, type RzpRefund } from "@/lib/razorpay";
import { addOrderEvent, lockOrder } from "./orders";

type Actor = { id: string; email: string } | null | undefined;

/**
 * Initiates a refund.
 *  • Online payments → real Razorpay Refund API (status then tracked via webhooks).
 *  • COD / manual → records a manual refund with the admin's bank/UPI reference.
 * Never marks money as refunded without either the gateway's confirmation or an explicit manual record.
 */
export async function initiateRefund(input: {
  orderId: string;
  amount: number;
  reason: string;
  actor?: Actor;
  system?: boolean;
  returnId?: string | null;
  manualReference?: string | null;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new AppError("Refund amount must be greater than zero.");
  const order = await db.order.findUniqueOrThrow({ where: { id: input.orderId }, include: { payments: true, refunds: true } });
  const payment = order.payments.find((p) => ["PAID", "REFUND_PENDING", "PARTIALLY_REFUNDED"].includes(p.status));
  if (!payment) throw new AppError("There is no collected payment on this order to refund.");
  const pendingOrDone = order.refunds
    .filter((r) => r.paymentId === payment.id && r.status !== "FAILED")
    .reduce((s, r) => s + r.amount, 0);
  const refundable = payment.amount - pendingOrDone;
  if (input.amount > refundable) throw new AppError(`At most ${formatINR(refundable)} can be refunded on this order.`);

  const useGateway = payment.method === "ONLINE" && payment.razorpayPaymentId;
  if (!useGateway && !input.manualReference) {
    throw new AppError("Enter the bank/UPI transaction reference for this manual (COD) refund.");
  }

  const refund = await db.refund.create({
    data: {
      orderId: order.id, paymentId: payment.id, returnId: input.returnId ?? null,
      mode: useGateway ? "RAZORPAY" : "MANUAL", amount: input.amount, reason: input.reason.slice(0, 300),
      reference: input.manualReference ?? null, initiatedById: input.actor?.id ?? null,
      status: "PENDING",
    },
  });

  if (useGateway) {
    let gw: RzpRefund;
    try {
      gw = await razorpay.createRefund(payment.razorpayPaymentId!, {
        amount: input.amount,
        notes: { refundId: refund.id, orderNumber: order.orderNumber },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "gateway error";
      await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureReason: msg.slice(0, 300) } });
      await addOrderEventStandalone(order.id, "REFUND_FAILED", `Refund of ${formatINR(input.amount)} failed at Razorpay: ${msg}`, input.actor?.id);
      throw err;
    }
    await db.refund.update({ where: { id: refund.id }, data: { razorpayRefundId: gw.id } });
    await db.$transaction(async (tx) => {
      await lockOrder(tx, order.id);
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUND_PENDING" } });
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUND_PENDING" } });
      await addOrderEvent(tx, order.id, "REFUND_INITIATED", `Refund of ${formatINR(input.amount)} initiated via Razorpay (${gw.id}).`, input.actor?.id);
      if (input.returnId) await tx.returnRequest.update({ where: { id: input.returnId }, data: { status: "REFUND_INITIATED" } });
    });
    if (input.actor) await audit({ actor: input.actor, action: "refund.initiate", entityType: "Order", entityId: order.id, newValue: { amount: input.amount, razorpayRefundId: gw.id, reason: input.reason } });
    await notifyCustomer("REFUND_INITIATED", { orderId: order.id, key: refund.id, extra: { amount: input.amount } });
    // Razorpay may process instantly; apply its status through the same idempotent path as webhooks.
    if (gw.status === "processed" || gw.status === "failed") await applyRefundUpdate(gw, `refund.${gw.status}`);
  } else {
    await db.$transaction(async (tx) => {
      await lockOrder(tx, order.id);
      await addOrderEvent(tx, order.id, "REFUND_INITIATED", `Manual refund of ${formatINR(input.amount)} recorded (ref ${input.manualReference}).`, input.actor?.id);
    });
    if (input.actor) await audit({ actor: input.actor, action: "refund.manual", entityType: "Order", entityId: order.id, newValue: { amount: input.amount, reference: input.manualReference, reason: input.reason } });
    await markRefundProcessed(refund.id);
  }
  return refund.id;
}

async function addOrderEventStandalone(orderId: string, type: string, message: string, actorId?: string | null) {
  await db.orderEvent.create({ data: { orderId, type, message, actorId: actorId ?? null } });
}

/** Transitions a refund to PROCESSED exactly once and rolls the amount into the payment/order state. */
async function markRefundProcessed(refundId: string) {
  const res = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
    if (!rows[0]) return null;
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
    if (refund.status === "PROCESSED") return null;
    await lockOrder(tx, refund.orderId);
    await tx.refund.update({ where: { id: refundId }, data: { status: "PROCESSED", processedAt: new Date(), failureReason: null } });
    const refunded = refund.payment.refundedAmount + refund.amount;
    const stillPending = await tx.refund.count({ where: { paymentId: refund.paymentId, status: "PENDING", NOT: { id: refundId } } });
    const status = stillPending > 0 ? "REFUND_PENDING" : refunded >= refund.payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.payment.update({ where: { id: refund.paymentId }, data: { refundedAmount: refunded, status } });
    await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus: status } });
    await addOrderEvent(tx, refund.orderId, "REFUND_COMPLETED", `Refund of ${formatINR(refund.amount)} completed.`);
    if (refund.returnId) await tx.returnRequest.update({ where: { id: refund.returnId }, data: { status: "REFUNDED" } });
    return refund;
  });
  if (res) {
    await notifyCustomer("REFUND_COMPLETED", { orderId: res.orderId, key: res.id, extra: { amount: res.amount } });
    await notifyAdmin("ADMIN_REFUND_UPDATE", { orderId: res.orderId, key: `${res.id}:processed`, extra: { amount: res.amount, reason: "processed" } });
  }
}

/** Applies a Razorpay refund entity (from webhook or API response). Idempotent. */
export async function applyRefundUpdate(entity: RzpRefund, event: string): Promise<"ok" | "ignored"> {
  let refund = await db.refund.findUnique({ where: { razorpayRefundId: entity.id } });
  if (!refund && entity.notes?.refundId) {
    refund = await db.refund.findUnique({ where: { id: entity.notes.refundId } });
    if (refund && !refund.razorpayRefundId) refund = await db.refund.update({ where: { id: refund.id }, data: { razorpayRefundId: entity.id } });
  }
  if (!refund) {
    // Refund created directly in the Razorpay dashboard — record it so our books match.
    const payment = await db.payment.findUnique({ where: { razorpayPaymentId: entity.payment_id } });
    if (!payment) return "ignored";
    refund = await db.refund.create({
      data: { orderId: payment.orderId, paymentId: payment.id, mode: "RAZORPAY", razorpayRefundId: entity.id, amount: entity.amount, reason: "Created in Razorpay dashboard", status: "PENDING" },
    });
    await db.$transaction(async (tx) => {
      await lockOrder(tx, payment.orderId);
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUND_PENDING" } });
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "REFUND_PENDING" } });
      await addOrderEvent(tx, payment.orderId, "REFUND_INITIATED", `Refund ${entity.id} detected from Razorpay.`);
    });
  }

  const status = event === "refund.processed" || entity.status === "processed" ? "processed"
    : event === "refund.failed" || entity.status === "failed" ? "failed" : "pending";

  if (status === "processed") {
    await markRefundProcessed(refund.id);
  } else if (status === "failed" && refund.status !== "FAILED" && refund.status !== "PROCESSED") {
    await db.$transaction(async (tx) => {
      await lockOrder(tx, refund!.orderId);
      await tx.refund.update({ where: { id: refund!.id }, data: { status: "FAILED", failureReason: "Razorpay reported refund failure" } });
      const pay = await tx.payment.findUniqueOrThrow({ where: { id: refund!.paymentId } });
      const pending = await tx.refund.count({ where: { paymentId: pay.id, status: "PENDING" } });
      if (pending === 0) {
        const back = pay.refundedAmount === 0 ? "PAID" : pay.refundedAmount >= pay.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
        await tx.payment.update({ where: { id: pay.id }, data: { status: back } });
        await tx.order.update({ where: { id: pay.orderId }, data: { paymentStatus: back, needsAttention: "A refund failed at Razorpay — retry or refund manually." } });
      }
      await addOrderEvent(tx, refund!.orderId, "REFUND_FAILED", `Refund ${entity.id} failed at Razorpay.`);
    });
    await notifyAdmin("ADMIN_REFUND_UPDATE", { orderId: refund.orderId, key: `${refund.id}:failed`, extra: { amount: refund.amount, reason: "FAILED — action needed" } });
  }
  return "ok";
}

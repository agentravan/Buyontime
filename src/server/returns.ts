import "server-only";
import type { ReturnCondition } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import { notifyAdmin, notifyCustomer } from "@/lib/notifications/dispatch";
import { getSettings } from "@/lib/settings";
import { applyReturnCondition } from "./inventory";
import { addOrderEvent, lockOrder } from "./orders";
import { initiateRefund } from "./refunds";

type Actor = { id: string; email: string };

export async function requestReturn(user: SessionUser, input: { orderNumber: string; items: { orderItemId: string; quantity: number }[]; reason: string; details?: string | null }) {
  const settings = await getSettings();
  const order = await db.order.findUnique({ where: { orderNumber: input.orderNumber }, include: { items: true, returns: { include: { items: true } } } });
  if (!order || order.userId !== user.id) throw new ForbiddenError("Order not found.");
  if (order.status !== "DELIVERED" && order.status !== "RETURN_REQUESTED" && order.status !== "RETURNED") throw new AppError("Returns can be requested only for delivered orders.");
  if (!order.deliveredAt || Date.now() - order.deliveredAt.getTime() > settings.returnWindowDays * 86400000) {
    throw new AppError(`The ${settings.returnWindowDays}-day return window for this order has closed.`);
  }
  const items = input.items.filter((i) => i.quantity > 0);
  if (items.length === 0) throw new AppError("Select at least one item to return.");
  for (const it of items) {
    const oi = order.items.find((o) => o.id === it.orderItemId);
    if (!oi) throw new AppError("Invalid item.");
    const inProgress = order.returns
      .filter((r) => !["REJECTED"].includes(r.status))
      .flatMap((r) => r.items)
      .filter((ri) => ri.orderItemId === oi.id)
      .reduce((s, ri) => s + ri.quantity, 0);
    if (it.quantity > oi.quantity - inProgress) throw new AppError(`You can return at most ${oi.quantity - inProgress} of ${oi.name}.`);
  }

  const ret = await db.$transaction(async (tx) => {
    await lockOrder(tx, order.id);
    const r = await tx.returnRequest.create({
      data: {
        orderId: order.id, userId: user.id, reason: input.reason.slice(0, 200), details: input.details?.slice(0, 1000) || null,
        items: { create: items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "RETURN_REQUESTED" } });
    await addOrderEvent(tx, order.id, "RETURN_REQUESTED", `Return requested: ${input.reason}`, user.id);
    return r;
  });
  await notifyCustomer("RETURN_REQUESTED", { orderId: order.id, key: ret.id });
  await notifyAdmin("ADMIN_RETURN_REQUEST", { orderId: order.id, key: ret.id, extra: { reason: input.reason } });
  return ret.id;
}

export async function decideReturn(returnId: string, actor: Actor, decision: "APPROVED" | "REJECTED", note?: string | null) {
  await db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findUniqueOrThrow({ where: { id: returnId } });
    if (r.status !== "REQUESTED") throw new AppError("This return has already been reviewed.");
    await lockOrder(tx, r.orderId);
    await tx.returnRequest.update({ where: { id: returnId }, data: { status: decision, adminNote: note ?? null } });
    if (decision === "REJECTED") {
      const active = await tx.returnRequest.count({ where: { orderId: r.orderId, status: { in: ["REQUESTED", "APPROVED"] }, NOT: { id: returnId } } });
      const received = await tx.returnRequest.count({ where: { orderId: r.orderId, status: { in: ["RECEIVED", "REFUND_INITIATED", "REFUNDED"] } } });
      if (active === 0) await tx.order.update({ where: { id: r.orderId }, data: { status: received > 0 ? "RETURNED" : "DELIVERED" } });
    }
    await addOrderEvent(tx, r.orderId, `RETURN_${decision}`, `Return ${decision.toLowerCase()}${note ? `: ${note}` : ""}`, actor.id);
    await audit({ actor, action: `return.${decision.toLowerCase()}`, entityType: "ReturnRequest", entityId: returnId, oldValue: { status: r.status }, newValue: { status: decision, note } }, tx);
  });
}

/**
 * Records the inspected condition of each returned unit. Only RESELLABLE units go back to sellable stock;
 * DAMAGED and RETURN_TO_SUPPLIER are recorded in the inventory ledger without increasing stock.
 */
export async function receiveReturn(returnId: string, actor: Actor, input: { conditions: { returnItemId: string; condition: ReturnCondition }[]; returnShippingCost?: number | null }) {
  return db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findUniqueOrThrow({ where: { id: returnId }, include: { items: true, order: { include: { items: true } } } });
    if (r.status !== "APPROVED") throw new AppError("Approve the return before marking it received.");
    await lockOrder(tx, r.orderId);
    let refundAmount = 0;
    const { subtotal, discount } = r.order;
    for (const ri of r.items) {
      const cond = input.conditions.find((c) => c.returnItemId === ri.id)?.condition;
      if (!cond) throw new AppError("Choose a condition for every returned item.");
      const oi = r.order.items.find((o) => o.id === ri.orderItemId)!;
      await tx.returnItem.update({ where: { id: ri.id }, data: { condition: cond } });
      await tx.orderItem.update({ where: { id: oi.id }, data: { returnedQuantity: { increment: ri.quantity } } });
      await applyReturnCondition(tx, { variantId: oi.variantId, quantity: ri.quantity, condition: cond, orderId: r.orderId, actorId: actor.id });
      const gross = oi.unitPrice * ri.quantity;
      refundAmount += subtotal > 0 ? Math.round(gross - (gross * discount) / subtotal) : gross;
    }
    await tx.returnRequest.update({ where: { id: returnId }, data: { status: "RECEIVED", refundAmount } });
    await tx.order.update({ where: { id: r.orderId }, data: { status: "RETURNED" } });
    if (input.returnShippingCost) {
      await tx.shippingInformation.upsert({
        where: { orderId: r.orderId },
        update: { returnCost: { increment: input.returnShippingCost } },
        create: { orderId: r.orderId, returnCost: input.returnShippingCost },
      });
    }
    await addOrderEvent(tx, r.orderId, "RETURN_RECEIVED", "Returned items received and inspected.", actor.id);
    await audit({ actor, action: "return.received", entityType: "ReturnRequest", entityId: returnId, newValue: { conditions: input.conditions, refundAmount } }, tx);
    return refundAmount;
  });
}

export async function refundReturn(returnId: string, actor: Actor, input: { amount: number; manualReference?: string | null }) {
  const r = await db.returnRequest.findUniqueOrThrow({ where: { id: returnId } });
  if (r.status !== "RECEIVED") throw new AppError("Mark the return as received before refunding.");
  await initiateRefund({ orderId: r.orderId, amount: input.amount, reason: `Return ${r.reason}`, actor, returnId, manualReference: input.manualReference });
}

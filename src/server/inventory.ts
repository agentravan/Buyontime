import "server-only";
import type { InventoryMovementType, ReturnCondition } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { StockError } from "@/lib/errors";
import { notifyAdmin } from "@/lib/notifications/dispatch";

export type StockLine = { variantId: string; quantity: number; name?: string };

async function movement(tx: Tx, data: { variantId: string; type: InventoryMovementType; delta: number; quantity: number; orderId?: string | null; note?: string; actorId?: string | null }) {
  await tx.inventoryMovement.create({ data: { ...data, orderId: data.orderId ?? null, actorId: data.actorId ?? null } });
}

/**
 * Atomically decrements available stock. Uses a conditional UPDATE (stock >= qty) so two concurrent
 * checkouts can never oversell the last unit — the loser gets a StockError and the transaction rolls back.
 */
export async function reserveStock(tx: Tx, lines: StockLine[], orderId: string) {
  for (const line of lines) {
    const res = await tx.productVariant.updateMany({
      where: { id: line.variantId, isActive: true, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    if (res.count !== 1) {
      throw new StockError(`${line.name ?? "An item"} is out of stock or not available in the requested quantity.`);
    }
    await movement(tx, { variantId: line.variantId, type: "RESERVE", delta: -line.quantity, quantity: line.quantity, orderId });
  }
}

/** Marks reserved units as sold. */
export async function commitStock(tx: Tx, lines: StockLine[]) {
  for (const line of lines) {
    await tx.productVariant.update({ where: { id: line.variantId }, data: { soldCount: { increment: line.quantity } } });
  }
}

/** Returns units to sellable stock for a cancelled / expired / RTO order, based on its stock state. */
export async function releaseOrderStock(tx: Tx, orderId: string, note: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (order.stockState !== "RESERVED" && order.stockState !== "COMMITTED") return;
  for (const item of order.items) {
    await tx.productVariant.update({
      where: { id: item.variantId },
      data: {
        stock: { increment: item.quantity },
        ...(order.stockState === "COMMITTED" ? { soldCount: { decrement: item.quantity } } : {}),
      },
    });
    await movement(tx, { variantId: item.variantId, type: "RELEASE", delta: item.quantity, quantity: item.quantity, orderId, note });
  }
  await tx.order.update({ where: { id: orderId }, data: { stockState: "RELEASED" } });
}

/** Handles a returned unit according to its inspected condition. Only RESELLABLE goes back to sellable stock. */
export async function applyReturnCondition(tx: Tx, input: { variantId: string; quantity: number; condition: ReturnCondition; orderId: string; actorId: string }) {
  const typeMap = { RESELLABLE: "RETURN_RESELLABLE", DAMAGED: "RETURN_DAMAGED", RETURN_TO_SUPPLIER: "RETURN_TO_SUPPLIER" } as const;
  await tx.productVariant.update({
    where: { id: input.variantId },
    data: {
      soldCount: { decrement: input.quantity },
      ...(input.condition === "RESELLABLE" ? { stock: { increment: input.quantity } } : {}),
    },
  });
  await movement(tx, {
    variantId: input.variantId,
    type: typeMap[input.condition],
    delta: input.condition === "RESELLABLE" ? input.quantity : 0,
    quantity: input.quantity,
    orderId: input.orderId,
    actorId: input.actorId,
    note: `Return inspected: ${input.condition.toLowerCase().replace(/_/g, " ")}`,
  });
}

/** Admin stock correction. Records the change in the ledger. */
export async function setStock(tx: Tx, variantId: string, newStock: number, actorId: string, note?: string) {
  const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  const delta = newStock - v.stock;
  if (delta === 0) return v;
  const updated = await tx.productVariant.update({ where: { id: variantId }, data: { stock: newStock } });
  await movement(tx, { variantId, type: "ADJUSTMENT", delta, quantity: Math.abs(delta), actorId, note: note ?? "Manual stock update" });
  return updated;
}

/** Creates a low-stock admin notification (at most one per variant per day). */
export async function checkLowStock(variantIds: string[]) {
  if (variantIds.length === 0) return;
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { name: true, lowStockThreshold: true } } },
  });
  const day = new Date().toISOString().slice(0, 10);
  for (const v of variants) {
    if (v.stock <= v.product.lowStockThreshold) {
      await notifyAdmin("ADMIN_LOW_STOCK", {
        key: `${v.id}:${day}`,
        extra: { productName: v.name === "Default" ? v.product.name : `${v.product.name} (${v.name})`, stock: v.stock },
      });
    }
  }
}

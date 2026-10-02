import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Store wallet. `User.walletBalance` is the running balance; `WalletEntry` is the ledger behind it.
 * Both always change together inside one transaction. Debits use a conditional update, so two orders
 * placed at the same moment can never spend the same money twice.
 */

export type WalletReason = "REFERRAL_GIFT" | "REFERRAL_BONUS" | "ORDER_PAYMENT" | "ORDER_REFUND" | "ADMIN_ADJUST";

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Adds money to a wallet. With a `dedupeKey`, a repeat of the same credit is ignored (returns false). */
export async function creditWallet(
  tx: Tx,
  input: { userId: string; amount: number; reason: WalletReason; note?: string | null; orderId?: string | null; dedupeKey?: string | null; actorId?: string | null },
): Promise<boolean> {
  const amount = Math.floor(input.amount);
  if (amount <= 0) return false;
  if (input.dedupeKey) {
    const done = await tx.walletEntry.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
    if (done) return false;
  }
  await tx.walletEntry.create({
    data: { userId: input.userId, amount, reason: input.reason, note: input.note ?? null, orderId: input.orderId ?? null, dedupeKey: input.dedupeKey ?? null, actorId: input.actorId ?? null },
  });
  await tx.user.update({ where: { id: input.userId }, data: { walletBalance: { increment: amount } } });
  return true;
}

/** Takes money out of a wallet. Throws if the balance is too low (nothing is changed in that case). */
export async function debitWallet(
  tx: Tx,
  input: { userId: string; amount: number; reason: WalletReason; note?: string | null; orderId?: string | null; actorId?: string | null },
): Promise<void> {
  const amount = Math.floor(input.amount);
  if (amount <= 0) return;
  const done = await tx.user.updateMany({ where: { id: input.userId, walletBalance: { gte: amount } }, data: { walletBalance: { decrement: amount } } });
  if (done.count !== 1) throw new AppError("Your wallet balance has changed. Please review the order and try again.", "WALLET_CHANGED", 409);
  await tx.walletEntry.create({
    data: { userId: input.userId, amount: -amount, reason: input.reason, note: input.note ?? null, orderId: input.orderId ?? null, actorId: input.actorId ?? null },
  });
}

export function debitWalletForOrder(tx: Tx, userId: string, amount: number, orderId: string, orderNumber: string) {
  return debitWallet(tx, { userId, amount, reason: "ORDER_PAYMENT", orderId, note: `Paid towards order ${orderNumber}` });
}

/** Returns an order's wallet payment when the order is cancelled. Happens once per order. */
export function refundWalletForOrder(tx: Tx, userId: string, amount: number, orderId: string, orderNumber: string) {
  return creditWallet(tx, { userId, amount, reason: "ORDER_REFUND", orderId, note: `Order ${orderNumber} cancelled`, dedupeKey: `order-refund:${orderId}` });
}

export type WalletView = { balance: number; maxPercent: number; entries: { id: string; amount: number; reason: WalletReason; note: string | null; createdAt: string }[] };

export async function getWallet(userId: string, maxPercent: number): Promise<WalletView> {
  const [u, entries] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { walletBalance: true } }),
    db.walletEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return {
    balance: u?.walletBalance ?? 0,
    maxPercent,
    entries: entries.map((e) => ({ id: e.id, amount: e.amount, reason: e.reason as WalletReason, note: e.note, createdAt: e.createdAt.toISOString() })),
  };
}

/** Admin correction: add (+) or take (−) wallet money, with a note. */
export async function adjustWallet(actor: { id: string }, userId: string, amountPaise: number, note: string): Promise<number> {
  const amount = Math.trunc(amountPaise);
  if (!Number.isFinite(amount) || amount === 0) throw new AppError("Enter an amount.");
  if (Math.abs(amount) > 5_000_000) throw new AppError("That amount is too large for one adjustment.");
  const text = note.trim().slice(0, 200);
  if (text.length < 3) throw new AppError("Add a short note saying why.");
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
      if (u.role !== "CUSTOMER") throw new AppError("Only customer accounts have a wallet.");
      if (amount > 0) await creditWallet(tx, { userId, amount, reason: "ADMIN_ADJUST", note: text, actorId: actor.id });
      else await debitWallet(tx, { userId, amount: -amount, reason: "ADMIN_ADJUST", note: text, actorId: actor.id });
      return (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } })).walletBalance;
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "WALLET_CHANGED") throw new AppError("The wallet does not have that much money.");
    if (isUnique(e)) throw new AppError("Please try again.");
    throw e;
  }
}

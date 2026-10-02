import "server-only";
import { randomInt } from "node:crypto";
import { cache } from "react";
import { Prisma, type Coupon, type SpinResult, type StoreSettings } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import {
  PRIZE_PERCENT, dealRank, grantedSegments, ordersToNextVoucher, pickSegment, prizeTitle, publicSegments, spinsAllowed, totalWeight, vouchersEarned,
  type Deal, type SpinPrizeKey, type WheelSegment,
} from "@/lib/spin";

/** One reward as the customer sees it. A voucher's details stay hidden until its card is scratched. */
export type SpinOutcome = {
  id: string;
  prize: SpinPrizeKey;
  title: string;
  createdAt: string;
  coupon: { code: string; description: string | null; expiresAt: string | null; used: boolean; expired: boolean } | null;
  voucher: { revealed: boolean; brand: string | null; amount: number | null; code: string | null } | null;
};

export type SpinState = {
  enabled: boolean;
  signedIn: boolean;
  /** False for staff accounts: only customer accounts spin. */
  eligible: boolean;
  canSpin: boolean;
  spinsLeft: number;
  spinsPerOrder: number;
  /** Set when the next spin lands on the gift voucher: given by the store, or earned by delivered orders. */
  gift: "granted" | "milestone" | null;
  /** The wheel for the next spin (or the usual wheel when no spin is available). */
  segments: WheelSegment[];
  /** Newest first. */
  results: SpinOutcome[];
  /** How the locked gift-voucher slice is unlocked, with the customer's progress. */
  voucherNote: string | null;
  terms: { minOrder: number; maxDiscount: number; validDays: number; voucherEvery: number; voucherAmount: number };
};

/** Internal signal: the state changed under us, recompute and try again. */
class RetrySpin extends Error {}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function newCouponCode(): string {
  let s = "SPIN-";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

const withCoupon = { coupon: { select: { code: true, description: true, expiresAt: true, usedCount: true } } } as const;
type SpinWithCoupon = SpinResult & { coupon: { code: string; description: string | null; expiresAt: Date | null; usedCount: number } | null };

function toOutcome(r: SpinWithCoupon): SpinOutcome {
  const isVoucher = r.prize === "GIFT_VOUCHER";
  const revealed = Boolean(r.revealedAt);
  return {
    id: r.id,
    prize: r.prize,
    title: isVoucher && !revealed ? "A gift — scratch to reveal" : prizeTitle(r.prize, r.voucherAmount),
    createdAt: r.createdAt.toISOString(),
    coupon: r.coupon
      ? {
          code: r.coupon.code, description: r.coupon.description, expiresAt: r.coupon.expiresAt?.toISOString() ?? null,
          used: r.coupon.usedCount > 0, expired: Boolean(r.coupon.expiresAt && r.coupon.expiresAt < new Date()),
        }
      : null,
    voucher: isVoucher
      ? { revealed, brand: revealed ? r.voucherBrand : null, amount: revealed ? r.voucherAmount : null, code: revealed ? r.voucherCode : null }
      : null,
  };
}

/** Orders that earn a spin: paid online orders, and COD orders once delivered. Cancelled / returned ones do not count. */
const earningOrder = (userId: string): Prisma.OrderWhereInput => ({
  userId,
  status: { notIn: ["PENDING_PAYMENT", "CANCELLED", "RTO", "RETURNED"] },
  OR: [{ paymentMethod: "ONLINE", paymentStatus: "PAID" }, { status: "DELIVERED" }],
});

type Entitlement = {
  /** Spins the account can use right now (order-earned, voucher spins earned, and admin-given). */
  spinsLeft: number;
  results: SpinWithCoupon[];
  canSpin: boolean;
  /** Why the next spin lands on the gift voucher, if it does. */
  gift: "granted" | "milestone" | null;
  segments: WheelSegment[];
  voucherNote: string | null;
};

const rupee = (paise: number) => Math.round(paise / 100);

async function entitlement(userId: string, settings: StoreSettings): Promise<Entitlement> {
  const every = settings.spinVoucherEveryOrders;
  const [u, results, orders, delivered] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { role: true, voucherSpins: true } }),
    db.spinResult.findMany({ where: { userId }, orderBy: { seq: "desc" }, include: withCoupon }),
    db.order.count({ where: earningOrder(userId) }),
    db.order.count({ where: { userId, status: "DELIVERED" } }),
  ]);
  const isCustomer = u?.role === "CUSTOMER";
  // Voucher spins (admin-given, or earned by delivered orders) are extra: they do not use up deal spins.
  const regularUsed = results.filter((r) => r.prize !== "GIFT_VOUCHER").length;
  const milestoneUsed = results.filter((r) => r.prize === "GIFT_VOUCHER" && !r.granted).length;
  const milestoneLeft = isCustomer ? Math.max(0, vouchersEarned(delivered, every) - milestoneUsed) : 0;
  const grantedLeft = isCustomer ? u?.voucherSpins ?? 0 : 0;
  const allowed = spinsAllowed(orders, settings.spinsPerOrder);
  const regularLeft = isCustomer ? Math.max(0, allowed - regularUsed) : 0;
  const gift = grantedLeft > 0 ? "granted" : milestoneLeft > 0 ? "milestone" : null;

  const toGo = ordersToNextVoucher(delivered, every);
  return {
    spinsLeft: regularLeft + milestoneLeft + grantedLeft,
    results,
    canSpin: settings.spinEnabled && (gift !== null || regularLeft > 0),
    gift,
    segments: gift
      ? grantedSegments(settings, settings.giftVoucherAmount)
      : publicSegments(settings, every > 0 ? { amount: settings.giftVoucherAmount, every } : null),
    voucherNote: every > 0 && !gift
      ? `Amazon ₹${rupee(settings.giftVoucherAmount)} gift voucher: yours after every ${every} delivered orders — the spin you earn then lands on it. You have ${delivered} delivered so far, ${toGo} more to go. Ordinary spins never land on it.`
      : null,
  };
}

export async function getSpinState(user: SessionUser | null): Promise<SpinState> {
  const settings = await getSettings();
  const terms = { minOrder: settings.spinMinOrder, maxDiscount: settings.spinMaxDiscount, validDays: settings.spinCouponValidDays, voucherEvery: settings.spinVoucherEveryOrders, voucherAmount: settings.giftVoucherAmount };
  if (!user) {
    const every = settings.spinVoucherEveryOrders;
    const segments = publicSegments(settings, every > 0 ? { amount: settings.giftVoucherAmount, every } : null);
    return {
      enabled: settings.spinEnabled && segments.length > 0, signedIn: false, eligible: true, canSpin: false, spinsLeft: 0, spinsPerOrder: settings.spinsPerOrder, gift: null, segments, results: [],
      voucherNote: every > 0 ? `Amazon ₹${rupee(settings.giftVoucherAmount)} gift voucher: yours after every ${every} delivered orders — the spin you earn then lands on it. Ordinary spins never land on it.` : null,
      terms,
    };
  }
  const e = await entitlement(user.id, settings);
  return {
    enabled: settings.spinEnabled && (e.segments.length > 0 || e.results.length > 0),
    signedIn: true, eligible: user.role === "CUSTOMER", canSpin: e.canSpin && totalWeight(e.segments) > 0, spinsLeft: e.spinsLeft, spinsPerOrder: settings.spinsPerOrder, gift: e.gift, segments: e.segments,
    results: e.results.map(toOutcome), voucherNote: e.voucherNote, terms,
  };
}

function couponFor(prize: SpinPrizeKey, userId: string, settings: StoreSettings): Prisma.CouponUncheckedCreateInput | null {
  const expiresAt = new Date(Date.now() + settings.spinCouponValidDays * 24 * 60 * 60 * 1000);
  const common = { code: newCouponCode(), userId, source: "spin", usageLimit: 1, perUserLimit: 1, isActive: true, expiresAt };
  const pct = PRIZE_PERCENT[prize];
  if (pct) {
    const cap = settings.spinMaxDiscount > 0 ? settings.spinMaxDiscount : null;
    const parts = [`Spin & Win: ${pct}% off`];
    if (cap) parts.push(`(up to ${formatINR(cap)})`);
    if (settings.spinMinOrder > 0) parts.push(`on orders above ${formatINR(settings.spinMinOrder)}`);
    return { ...common, type: "PERCENTAGE", value: pct, minOrder: settings.spinMinOrder, maxDiscount: cap, description: parts.join(" ") };
  }
  if (prize === "FREE_DELIVERY") {
    return { ...common, type: "FIXED", value: 0, minOrder: 0, maxDiscount: null, freeShipping: true, description: "Spin & Win: free delivery on your order" };
  }
  return null;
}

/**
 * Spins the wheel. The prize is chosen here with a secure random number — the browser only animates
 * to the result. Returns the wheel that was spun so the animation lands on the right slice.
 */
export async function spinOnce(user: SessionUser): Promise<{ outcome: SpinOutcome; segments: WheelSegment[]; segmentIndex: number }> {
  if (user.role !== "CUSTOMER") throw new AppError("Spin & Win is for customer accounts.");
  await rateLimit(`spin:${user.id}`, 6, 60);
  const settings = await getSettings();
  if (!settings.spinEnabled) throw new AppError("Spin & Win is not running right now.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const e = await entitlement(user.id, settings);
    if (!e.canSpin) throw new AppError("You have no spins left. Place an order to earn another spin.", "NO_SPINS", 409);
    const total = totalWeight(e.segments);
    if (total <= 0) throw new AppError("Spin & Win is not running right now.");
    const picked = pickSegment(e.segments, randomInt(total))!;
    const seq = (e.results[0]?.seq ?? 0) + 1;
    try {
      const created = await db.$transaction(async (tx) => {
        if (e.gift === "granted") {
          // Use up one admin-given voucher spin; fails (count 0) if another request just took it.
          const used = await tx.user.updateMany({ where: { id: user.id, voucherSpins: { gt: 0 } }, data: { voucherSpins: { decrement: 1 } } });
          if (used.count !== 1) throw new RetrySpin();
        }
        const data = couponFor(picked.prize, user.id, settings);
        const coupon = data ? await tx.coupon.create({ data }) : null;
        return tx.spinResult.create({
          data: {
            userId: user.id, seq, granted: e.gift === "granted", prize: picked.prize, couponId: coupon?.id ?? null,
            ...(picked.prize === "GIFT_VOUCHER" ? { voucherBrand: "Amazon", voucherAmount: settings.giftVoucherAmount } : {}),
          },
          include: withCoupon,
        });
      });
      return { outcome: toOutcome(created), segments: e.segments, segmentIndex: Math.max(0, e.segments.findIndex((s) => s.prize === created.prize)) };
    } catch (err) {
      // A double-click raced us (userId + seq) or the random coupon code collided: work it out again.
      if (err instanceof RetrySpin || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) continue;
      throw err;
    }
  }
  throw new AppError("Could not complete your spin. Please try again.");
}

/** Marks a gift-voucher scratch card as revealed and returns what is under it. */
export async function revealVoucher(user: SessionUser, spinId: string): Promise<SpinOutcome> {
  const r = await db.spinResult.findUnique({ where: { id: spinId }, include: withCoupon });
  if (!r || r.userId !== user.id || r.prize !== "GIFT_VOUCHER") throw new AppError("There is nothing to reveal.");
  if (r.revealedAt) return toOutcome(r);
  return toOutcome(await db.spinResult.update({ where: { id: r.id }, data: { revealedAt: new Date() }, include: withCoupon }));
}

/**
 * The customer's current deal: the best of their unused, unexpired spin coupons. Memoised per request —
 * the layout, product pages, cart and checkout all read it.
 */
export const getActiveDeal = cache(async (userId: string | null | undefined): Promise<{ deal: Deal; coupon: Coupon } | null> => {
  if (!userId) return null;
  const coupons = await db.coupon.findMany({
    where: { userId, source: "spin", isActive: true, usedCount: 0, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const rank = (c: Coupon) => dealRank({ percent: c.type === "PERCENTAGE" ? c.value : null, freeShipping: c.freeShipping });
  const coupon = [...coupons].sort((a, b) => rank(b) - rank(a))[0];
  if (!coupon) return null;
  return {
    coupon,
    deal: {
      code: coupon.code,
      percent: coupon.type === "PERCENTAGE" ? coupon.value : null,
      freeShipping: coupon.freeShipping,
      minOrder: coupon.minOrder,
      maxDiscount: coupon.maxDiscount,
      expiresAt: coupon.expiresAt?.toISOString() ?? null,
    },
  };
});

/** True when placing this order earns the customer a spin right away (paid online) — COD earns it on delivery. */
export function orderEarnsSpinNow(order: { paymentMethod: string; paymentStatus: string; status: string }): boolean {
  return order.paymentMethod === "ONLINE" && order.paymentStatus === "PAID" && !["CANCELLED", "RTO", "RETURNED"].includes(order.status);
}

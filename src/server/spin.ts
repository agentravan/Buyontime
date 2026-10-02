import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type SpinResult, type StoreSettings } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { PRIZE_PERCENT, creatorSegments, pickSegment, prizeTitle, publicSegments, totalWeight, type SpinPrizeKey, type WheelSegment } from "@/lib/spin";

/** What the spin page shows after a spin. Never includes anything the customer should not see yet. */
export type SpinOutcome = {
  prize: SpinPrizeKey;
  title: string;
  /** Personal coupon for discount / free-delivery prizes. */
  coupon: { code: string; description: string | null; expiresAt: string | null; used: boolean } | null;
  /** Creator gift voucher: hidden behind the scratch card until revealed. */
  voucher: { revealed: boolean; brand: string | null; amount: number | null; code: string | null } | null;
};

export type SpinState = {
  enabled: boolean;
  signedIn: boolean;
  /** True for creator accounts selected by an admin. */
  creator: boolean;
  segments: WheelSegment[];
  outcome: SpinOutcome | null;
  terms: { minOrder: number; maxDiscount: number; validDays: number };
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function newCouponCode(): string {
  let s = "SPIN-";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

type SpinWithCoupon = SpinResult & { coupon: { code: string; description: string | null; expiresAt: Date | null; usedCount: number } | null };

function toOutcome(r: SpinWithCoupon): SpinOutcome {
  const isVoucher = r.prize === "CREATOR_VOUCHER";
  const revealed = Boolean(r.revealedAt);
  return {
    prize: r.prize,
    // The creator reward stays a surprise until the card is scratched.
    title: isVoucher && !revealed ? "A creator gift — scratch to reveal" : prizeTitle(r.prize, r.voucherAmount),
    coupon: r.coupon ? { code: r.coupon.code, description: r.coupon.description, expiresAt: r.coupon.expiresAt?.toISOString() ?? null, used: r.coupon.usedCount > 0 } : null,
    voucher: isVoucher
      ? { revealed, brand: revealed ? r.voucherBrand : null, amount: revealed ? r.voucherAmount : null, code: revealed ? r.voucherCode : null }
      : null,
  };
}

const withCoupon = { coupon: { select: { code: true, description: true, expiresAt: true, usedCount: true } } } as const;

async function segmentsFor(userId: string | null, settings: StoreSettings): Promise<{ creator: boolean; segments: WheelSegment[] }> {
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { creatorRewardEligible: true, role: true } });
    if (u?.role === "CUSTOMER" && u.creatorRewardEligible) return { creator: true, segments: creatorSegments() };
  }
  return { creator: false, segments: publicSegments(settings) };
}

export async function getSpinState(user: SessionUser | null): Promise<SpinState> {
  const settings = await getSettings();
  const existing = user ? await db.spinResult.findUnique({ where: { userId: user.id }, include: withCoupon }) : null;
  const { creator, segments } = await segmentsFor(user?.id ?? null, settings);
  return {
    enabled: settings.spinEnabled && (segments.length > 0 || Boolean(existing)),
    signedIn: Boolean(user),
    creator: existing ? existing.prize === "CREATOR_VOUCHER" : creator,
    // Someone who already spun sees the wheel they spun on.
    segments: existing?.prize === "CREATOR_VOUCHER" ? creatorSegments() : existing ? publicSegments(settings) : segments,
    outcome: existing ? toOutcome(existing) : null,
    terms: { minOrder: settings.spinMinOrder, maxDiscount: settings.spinMaxDiscount, validDays: settings.spinCouponValidDays },
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
 * Spins the wheel for a customer. The prize is chosen here with a secure random number —
 * the browser only animates to the result. One spin per account, enforced by a unique index.
 */
export async function spinOnce(user: SessionUser): Promise<{ outcome: SpinOutcome; segmentIndex: number; alreadySpun: boolean }> {
  if (user.role !== "CUSTOMER") throw new AppError("Spin & Win is for customer accounts.");
  await rateLimit(`spin:${user.id}`, 5, 60);
  const settings = await getSettings();
  if (!settings.spinEnabled) throw new AppError("Spin & Win is not running right now.");

  const { segments } = await segmentsFor(user.id, settings);
  const indexOf = (prize: SpinPrizeKey) => Math.max(0, segments.findIndex((s) => s.prize === prize));

  const existing = await db.spinResult.findUnique({ where: { userId: user.id }, include: withCoupon });
  if (existing) return { outcome: toOutcome(existing), segmentIndex: indexOf(existing.prize), alreadySpun: true };

  const total = totalWeight(segments);
  if (total <= 0) throw new AppError("Spin & Win is not running right now.");
  const picked = pickSegment(segments, randomInt(total))!;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await db.$transaction(async (tx) => {
        const data = couponFor(picked.prize, user.id, settings);
        const coupon = data ? await tx.coupon.create({ data }) : null;
        return tx.spinResult.create({
          data: {
            userId: user.id,
            prize: picked.prize,
            couponId: coupon?.id ?? null,
            ...(picked.prize === "CREATOR_VOUCHER" ? { voucherBrand: "Amazon", voucherAmount: settings.creatorVoucherAmount } : {}),
          },
          include: withCoupon,
        });
      });
      return { outcome: toOutcome(created), segmentIndex: indexOf(created.prize), alreadySpun: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Either a double-click raced us (userId) or the random coupon code collided (code): re-check, then retry.
        const raced = await db.spinResult.findUnique({ where: { userId: user.id }, include: withCoupon });
        if (raced) return { outcome: toOutcome(raced), segmentIndex: indexOf(raced.prize), alreadySpun: true };
        continue;
      }
      throw err;
    }
  }
  throw new AppError("Could not complete your spin. Please try again.");
}

/** Marks the creator scratch card as revealed and returns what is under it. */
export async function revealVoucher(user: SessionUser): Promise<SpinOutcome> {
  const r = await db.spinResult.findUnique({ where: { userId: user.id }, include: withCoupon });
  if (!r || r.prize !== "CREATOR_VOUCHER") throw new AppError("There is nothing to reveal.");
  if (r.revealedAt) return toOutcome(r);
  const updated = await db.spinResult.update({ where: { id: r.id }, data: { revealedAt: new Date() }, include: withCoupon });
  return toOutcome(updated);
}

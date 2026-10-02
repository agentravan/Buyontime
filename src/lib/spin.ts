/**
 * Spin & Win — pure rules (no database), shared by the server and the wheel UI.
 *
 * Honesty rule: the wheel never suggests a prize can be won on a spin when it cannot. The gift voucher
 * is a reward every customer earns after a set number of delivered orders: until then its slice is
 * drawn as "locked" and the page says exactly how it is unlocked; the spin that is earned lands on it.
 */

export type SpinPrizeKey = "DISCOUNT_10" | "DISCOUNT_20" | "DISCOUNT_30" | "FREE_DELIVERY" | "GIFT_VOUCHER";

export type SpinWeights = {
  spinWeight10: number;
  spinWeight20: number;
  spinWeight30: number;
  spinWeightFreeDelivery: number;
};

export type WheelSegment = {
  prize: SpinPrizeKey;
  label: string;
  /** Relative chance. */
  weight: number;
  /** Chance in percent (rounded to one decimal) — shown to shoppers. */
  chancePct: number;
  /** Drawn on the wheel but not winnable on this spin (the page explains how it is unlocked). */
  locked?: boolean;
};

const COUPON_PRIZES: { prize: SpinPrizeKey; label: string; key: keyof SpinWeights }[] = [
  { prize: "DISCOUNT_10", label: "10% OFF", key: "spinWeight10" },
  { prize: "FREE_DELIVERY", label: "Free delivery", key: "spinWeightFreeDelivery" },
  { prize: "DISCOUNT_20", label: "20% OFF", key: "spinWeight20" },
  { prize: "DISCOUNT_30", label: "30% OFF", key: "spinWeight30" },
];

export const PRIZE_PERCENT: Partial<Record<SpinPrizeKey, number>> = {
  DISCOUNT_10: 10,
  DISCOUNT_20: 20,
  DISCOUNT_30: 30,
};

const clean = (n: number | undefined) => Math.max(0, Math.floor(n || 0));

export function voucherLabel(amountPaise: number): string {
  return `Amazon ₹${Math.round(amountPaise / 100)}`;
}

/**
 * The wheel for an ordinary spin. A deal with weight 0 is left off the wheel entirely.
 * When the store runs the gift-voucher reward, pass `voucher`: its slice is drawn as locked
 * (weight 0 — an ordinary spin never lands on it).
 */
export function publicSegments(weights: SpinWeights, voucher?: { amount: number } | null): WheelSegment[] {
  const active = COUPON_PRIZES
    .map((p) => ({ prize: p.prize, label: p.label, weight: clean(weights[p.key]) }))
    .filter((p) => p.weight > 0);
  const total = active.reduce((s, p) => s + p.weight, 0);
  const segs: WheelSegment[] = active.map((p) => ({ ...p, chancePct: Math.round((p.weight / total) * 1000) / 10 }));
  if (voucher) segs.push({ prize: "GIFT_VOUCHER", label: voucherLabel(voucher.amount), weight: 0, chancePct: 0, locked: true });
  return segs;
}

/** Gift-voucher spins a customer has earned so far: one per `every` delivered orders. */
export function vouchersEarned(deliveredOrders: number, every: number): number {
  return every > 0 ? Math.floor(Math.max(0, deliveredOrders) / every) : 0;
}

/** Delivered orders still needed for the next gift-voucher spin. */
export function ordersToNextVoucher(deliveredOrders: number, every: number): number {
  return every > 0 ? every - (Math.max(0, deliveredOrders) % every) : 0;
}

/**
 * The wheel for a gift-voucher spin (earned by delivered orders, or given by an admin):
 * the usual prizes are drawn too, but this spin always lands on the voucher.
 */
export function grantedSegments(weights: SpinWeights, amount: number): WheelSegment[] {
  const base = publicSegments(weights, null).map((s) => ({ ...s, weight: 0, chancePct: 0 }));
  return [...base, { prize: "GIFT_VOUCHER", label: voucherLabel(amount), weight: 1, chancePct: 100 }];
}

/**
 * Weighted pick. `roll` must be an integer in [0, totalWeight) from a secure random source.
 * Returns null when there is nothing to win.
 */
export function pickSegment(segments: WheelSegment[], roll: number): WheelSegment | null {
  let acc = 0;
  for (const s of segments) {
    acc += s.weight;
    if (roll < acc) return s;
  }
  return null;
}

export function totalWeight(segments: WheelSegment[]): number {
  return segments.reduce((s, x) => s + x.weight, 0);
}

/** One free spin per account, plus `perOrder` spins for every completed order. */
export function spinsAllowed(completedOrders: number, perOrder = 1): number {
  return 1 + Math.max(0, completedOrders) * Math.max(0, Math.floor(perOrder));
}

/** Higher is better: the customer's best unused deal is the one shown and applied. */
export function dealRank(d: { percent: number | null; freeShipping: boolean }): number {
  return d.percent ? d.percent : d.freeShipping ? 1 : 0;
}

/** Customer-facing wording for a prize. */
export function prizeTitle(prize: SpinPrizeKey, voucherAmountPaise?: number | null): string {
  switch (prize) {
    case "DISCOUNT_10": return "10% off your next order";
    case "DISCOUNT_20": return "20% off your next order";
    case "DISCOUNT_30": return "30% off your next order";
    case "FREE_DELIVERY": return "Free delivery on your next order";
    case "GIFT_VOUCHER": return `Amazon gift voucher worth ₹${Math.round((voucherAmountPaise ?? 0) / 100)}`;
  }
}

/** The customer's unused spin coupon, in the shape the storefront needs to show deal prices. */
export type Deal = {
  code: string;
  /** Percentage off, or null for a free-delivery coupon. */
  percent: number | null;
  freeShipping: boolean;
  /** Paise. */
  minOrder: number;
  /** Paise, or null for no cap. */
  maxDiscount: number | null;
  expiresAt: string | null;
};

/**
 * Price of one unit with the deal applied, or null when the deal would not change it
 * (free-delivery coupon, or the item alone is below the coupon's minimum order).
 * The checkout applies the same rule to the whole order.
 */
export function dealUnitPrice(price: number, deal: Deal | null): number | null {
  if (!deal || !deal.percent || price < deal.minOrder) return null;
  let off = Math.floor((price * deal.percent) / 100);
  if (deal.maxDiscount !== null) off = Math.min(off, deal.maxDiscount);
  return off > 0 ? price - off : null;
}

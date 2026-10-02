/**
 * Spin & Win — pure rules (no database), shared by the server and the wheel UI.
 *
 * Honesty rule: the wheel only ever shows prizes the person spinning can actually win.
 * The creator gift voucher is therefore a separate one-segment reward that is shown
 * only to accounts an admin has marked as creators — never on the public wheel.
 */

export type SpinPrizeKey = "DISCOUNT_10" | "DISCOUNT_20" | "DISCOUNT_30" | "FREE_DELIVERY" | "CREATOR_VOUCHER";

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
};

const PUBLIC_PRIZES: { prize: SpinPrizeKey; label: string; key: keyof SpinWeights }[] = [
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

/** The prizes on the public wheel. A prize with weight 0 is left off the wheel entirely. */
export function publicSegments(weights: SpinWeights): WheelSegment[] {
  const active = PUBLIC_PRIZES.map((p) => ({ ...p, weight: Math.max(0, Math.floor(weights[p.key] || 0)) })).filter((p) => p.weight > 0);
  const total = active.reduce((s, p) => s + p.weight, 0);
  return active.map((p) => ({
    prize: p.prize,
    label: p.label,
    weight: p.weight,
    chancePct: Math.round((p.weight / total) * 1000) / 10,
  }));
}

/** The wheel shown to an admin-selected creator account: a single guaranteed reward. */
export function creatorSegments(): WheelSegment[] {
  return [{ prize: "CREATOR_VOUCHER", label: "Creator gift", weight: 1, chancePct: 100 }];
}

/**
 * Weighted pick. `roll` must be an integer in [0, totalWeight) from a secure random source.
 * Returns null when there is nothing to win (all weights are 0).
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

/** Customer-facing wording for a prize. */
export function prizeTitle(prize: SpinPrizeKey, voucherAmountPaise?: number | null): string {
  switch (prize) {
    case "DISCOUNT_10": return "10% off your order";
    case "DISCOUNT_20": return "20% off your order";
    case "DISCOUNT_30": return "30% off your order";
    case "FREE_DELIVERY": return "Free delivery on your order";
    case "CREATOR_VOUCHER": return `Amazon gift voucher worth ₹${Math.round((voucherAmountPaise ?? 0) / 100)}`;
  }
}

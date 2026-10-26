import type { MembershipPlan, StoreSettings } from "@prisma/client";

/**
 * BuyOnTime Plus pricing rules (pure functions, all money in paise).
 *
 *   landed cost      = purchase cost + forward shipping + other per-unit cost
 *   regular price    = landed cost + regularProfit   (₹180 by default — set with the admin "reprice" tool)
 *   member price     = landed cost + memberProfit    (₹100 by default — computed live, never stored)
 *
 * So with the default numbers a member saves ₹80 per unit on a correctly priced product. Products whose
 * cost is not filled in get no member price, so a missing cost can never turn into a loss-making discount.
 */

export type MemberPriceRule = { enabled: boolean; memberProfit: number; regularProfit: number };

export type CostParts = { costPrice: number; shippingCost: number; otherCost: number };

export const PLAN_MONTHS: Record<MembershipPlan, number> = { HALF_YEAR: 6, YEAR: 12 };
export const PLAN_LABEL: Record<MembershipPlan, string> = { HALF_YEAR: "6 months", YEAR: "12 months" };

export function memberRule(s: Pick<StoreSettings, "membershipEnabled" | "memberProfit" | "regularProfit">): MemberPriceRule {
  return { enabled: s.membershipEnabled, memberProfit: s.memberProfit, regularProfit: s.regularProfit };
}

export function planPrice(s: Pick<StoreSettings, "membershipPriceHalfYear" | "membershipPriceYear">, plan: MembershipPlan): number {
  return plan === "YEAR" ? s.membershipPriceYear : s.membershipPriceHalfYear;
}

export function landedCost(c: CostParts): number {
  return Math.max(0, c.costPrice) + Math.max(0, c.shippingCost) + Math.max(0, c.otherCost);
}

/** Rounds paise up to the next whole rupee (prices are shown without paise). */
export function ceilRupee(paise: number): number {
  return Math.ceil(paise / 100) * 100;
}

/**
 * The member price of one unit, or null when there is no member price for it (membership off,
 * cost unknown, or the regular price already gives no more than the member profit).
 */
export function memberUnitPrice(price: number, cost: CostParts, rule: MemberPriceRule): number | null {
  if (!rule.enabled) return null;
  const landed = landedCost(cost);
  if (cost.costPrice <= 0 || landed <= 0) return null;
  const member = ceilRupee(landed + rule.memberProfit);
  if (member >= price) return null;
  return member;
}

/** Regular (non-member) price that gives `regularProfit` on a product, rounded up to a whole rupee. */
export function suggestedRegularPrice(cost: CostParts, rule: Pick<MemberPriceRule, "regularProfit">): number | null {
  if (cost.costPrice <= 0) return null;
  return ceilRupee(landedCost(cost) + rule.regularProfit);
}

export type RepriceVerdict =
  | { kind: "no-cost" }
  | { kind: "same"; price: number }
  | { kind: "above-mrp"; price: number; mrp: number }
  | { kind: "change"; from: number; to: number };

/** What the reprice tool would do to one product. Never prices above MRP (illegal for packaged goods). */
export function repriceVerdict(p: CostParts & { price: number; mrp: number }, rule: Pick<MemberPriceRule, "regularProfit">): RepriceVerdict {
  const to = suggestedRegularPrice(p, rule);
  if (to === null) return { kind: "no-cost" };
  if (p.mrp > 0 && to > p.mrp) return { kind: "above-mrp", price: to, mrp: p.mrp };
  if (to === p.price) return { kind: "same", price: to };
  return { kind: "change", from: p.price, to };
}

/** Membership period: a renewal bought while still a member starts when the current one ends. */
export function membershipPeriod(now: Date, currentUntil: Date | null, months: number): { startsAt: Date; endsAt: Date } {
  const startsAt = currentUntil && currentUntil > now ? new Date(currentUntil) : new Date(now);
  const endsAt = new Date(startsAt);
  const day = endsAt.getUTCDate();
  endsAt.setUTCMonth(endsAt.getUTCMonth() + months);
  // 31 Aug + 6 months must not roll over into March: clamp to the last day of the target month.
  if (endsAt.getUTCDate() !== day) endsAt.setUTCDate(0);
  return { startsAt, endsAt };
}

export function isMemberActive(memberUntil: Date | null | undefined, now = new Date()): boolean {
  return Boolean(memberUntil && memberUntil > now);
}

/** How many vouchers a membership has earned from its delivered orders. */
export function rewardsEarned(deliveredMemberOrders: number, every: number): number {
  if (every <= 0) return 0;
  return Math.floor(Math.max(0, deliveredMemberOrders) / every);
}

/** A voucher amount between min and max (paise), in steps of ₹10. `rand(n)` returns 0..n-1. */
export function rewardAmount(min: number, max: number, rand: (n: number) => number): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(min, max);
  const steps = Math.floor((hi - lo) / 1000);
  return lo + (steps > 0 ? rand(steps + 1) * 1000 : 0);
}

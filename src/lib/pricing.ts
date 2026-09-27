import type { Coupon, PaymentMethod } from "@prisma/client";
import { gstIncluded } from "@/lib/money";

export type PricingItem = { unitPrice: number; quantity: number; gstRate: number };

export type PricingSettings = {
  freeShippingThreshold: number;
  standardShippingFee: number;
  codFee: number;
};

export type CouponCheck =
  | { ok: true; discount: number }
  | { ok: false; error: string };

/** Pure coupon evaluation. `usedByCustomer` = how many times this customer already used it. */
export function evaluateCoupon(
  coupon: Pick<Coupon, "type" | "value" | "minOrder" | "maxDiscount" | "expiresAt" | "usageLimit" | "perUserLimit" | "usedCount" | "isActive">,
  subtotal: number,
  usedByCustomer: number,
  now = new Date(),
): CouponCheck {
  if (!coupon.isActive) return { ok: false, error: "This coupon is not active." };
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, error: "This coupon has expired." };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, error: "This coupon has reached its usage limit." };
  }
  if (coupon.perUserLimit > 0 && usedByCustomer >= coupon.perUserLimit) {
    return { ok: false, error: "You have already used this coupon." };
  }
  if (subtotal < coupon.minOrder) {
    return { ok: false, error: `Add items worth ₹${Math.ceil((coupon.minOrder - subtotal) / 100)} more to use this coupon.` };
  }
  let discount =
    coupon.type === "PERCENTAGE" ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.max(0, Math.min(discount, subtotal));
  return { ok: true, discount };
}

export type Totals = {
  subtotal: number;
  discount: number;
  shippingFee: number;
  codFee: number;
  total: number;
  gstAmount: number;
  freeShippingRemaining: number;
};

/** Computes the payable amount. Selling prices are GST-inclusive; gstAmount is informational. */
export function computeTotals(
  items: PricingItem[],
  settings: PricingSettings,
  opts: { discount?: number; paymentMethod?: PaymentMethod | null } = {},
): Totals {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discount = Math.max(0, Math.min(opts.discount ?? 0, subtotal));
  const afterDiscount = subtotal - discount;
  const freeShipping = settings.freeShippingThreshold <= 0 || afterDiscount >= settings.freeShippingThreshold;
  const shippingFee = items.length === 0 || freeShipping ? 0 : settings.standardShippingFee;
  const codFee = opts.paymentMethod === "COD" ? settings.codFee : 0;
  const ratio = subtotal > 0 ? afterDiscount / subtotal : 0;
  const gstAmount = items.reduce(
    (s, i) => s + gstIncluded(Math.round(i.unitPrice * i.quantity * ratio), i.gstRate),
    0,
  );
  return {
    subtotal,
    discount,
    shippingFee,
    codFee,
    total: afterDiscount + shippingFee + codFee,
    gstAmount,
    freeShippingRemaining: freeShipping ? 0 : Math.max(0, settings.freeShippingThreshold - afterDiscount),
  };
}

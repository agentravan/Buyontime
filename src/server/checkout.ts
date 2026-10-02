import "server-only";
import type { Address, PaymentMethod, StoreSettings } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { razorpayConfig } from "@/lib/env";
import { resolvePaymentMethods, type PaymentAvailability } from "@/lib/payment-rules";
import { computeTotals, evaluateCoupon, type Totals } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { findCartId, getCartLines, type CartLine } from "./cart";

export type CheckoutState = {
  settings: StoreSettings;
  allLines: CartLine[];
  lines: CartLine[];
  excluded: CartLine[];
  group: PaymentMethod | null;
  address: Address | null;
  availability: PaymentAvailability;
  /** Availability computed on the whole cart (drives the split-order UI). */
  cartAvailability: PaymentAvailability;
  coupon: { code: string; id: string; discount: number; freeShipping: boolean } | null;
  couponError: string | null;
  totals: Totals;
  problems: string[];
};

function ruleItems(lines: CartLine[]) {
  return lines.map((l) => ({ productId: l.productId, name: l.name, paymentOption: l.paymentOption }));
}

/**
 * Single source of truth for checkout: the checkout page renders from it and order placement re-runs it
 * on the server, so the price, discount and allowed payment methods can never be tampered with client-side.
 */
export async function buildCheckout(opts: {
  user: SessionUser;
  group?: PaymentMethod | null;
  addressId?: string | null;
  couponCode?: string | null;
  paymentMethod?: PaymentMethod | null;
}): Promise<CheckoutState> {
  const settings = await getSettings();
  const gatewayConfigured = razorpayConfig().configured;
  const cartId = await findCartId(opts.user, false);
  const allLines = await getCartLines(cartId);

  const cartAvailability = resolvePaymentMethods({
    settings, gatewayConfigured, items: ruleItems(allLines), customer: opts.user,
  });

  let group: PaymentMethod | null = null;
  let lines = allLines;
  if (cartAvailability.conflict && settings.mixedCartPolicy === "SPLIT_ORDERS" && opts.group) {
    group = opts.group;
    const ids = new Set(cartAvailability.groups[group]);
    lines = allLines.filter((l) => ids.has(l.productId));
  }
  const excluded = allLines.filter((l) => !lines.includes(l));

  const addresses = await db.address.findMany({ where: { userId: opts.user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  const address = (opts.addressId ? addresses.find((a) => a.id === opts.addressId) : addresses[0]) ?? null;

  const problems: string[] = [];
  for (const l of lines) if (!l.available) problems.push(`${l.name}: ${l.issue}`);
  if (address && settings.unserviceablePincodes.includes(address.pincode)) {
    problems.push(`Sorry, we do not deliver to pincode ${address.pincode} yet.`);
  }

  const pricingItems = lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, gstRate: l.gstRate }));
  const subtotal = pricingItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  let coupon: CheckoutState["coupon"] = null;
  let couponError: string | null = null;
  const code = opts.couponCode?.trim().toUpperCase();
  if (code) {
    const c = await db.coupon.findUnique({ where: { code } });
    // Personal coupons (e.g. Spin & Win rewards) only work for the customer they were issued to.
    if (!c || (c.userId && c.userId !== opts.user.id)) couponError = "Invalid coupon code.";
    else {
      const used = await db.couponUsage.count({ where: { couponId: c.id, userId: opts.user.id } });
      const res = evaluateCoupon(c, subtotal, used);
      if (res.ok) coupon = { code: c.code, id: c.id, discount: res.discount, freeShipping: res.freeShipping };
      else couponError = res.error;
    }
  }

  // Evaluate COD limits against the COD total (COD fee included).
  const baseTotals = computeTotals(pricingItems, settings, { discount: coupon?.discount ?? 0, freeShipping: coupon?.freeShipping, paymentMethod: "ONLINE" });
  const codTotals = computeTotals(pricingItems, settings, { discount: coupon?.discount ?? 0, freeShipping: coupon?.freeShipping, paymentMethod: "COD" });
  const availability = resolvePaymentMethods({
    settings, gatewayConfigured, items: ruleItems(lines), customer: opts.user,
    pincode: address?.pincode, orderTotal: codTotals.total,
  });
  const totals = opts.paymentMethod === "COD" ? codTotals : baseTotals;

  return { settings, allLines, lines, excluded, group, address, availability, cartAvailability, coupon, couponError, totals, problems };
}

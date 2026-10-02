"use server";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, safeAction, type ActionResult } from "@/lib/errors";
import type { PaymentAvailability } from "@/lib/payment-rules";
import type { Totals } from "@/lib/pricing";
import { buildCheckout } from "@/server/checkout";
import { createPaymentAttempt, placeOrder, type PlaceOrderResult, type RazorpayCheckoutParams } from "@/server/orders";

export type Quote = {
  totals: Totals;
  availability: PaymentAvailability;
  coupon: { code: string; discount: number; freeShipping: boolean } | null;
  couponError: string | null;
  problems: string[];
};

export async function quoteCheckoutAction(input: {
  group?: "ONLINE" | "COD" | null;
  addressId?: string | null;
  couponCode?: string | null;
  paymentMethod?: "ONLINE" | "COD" | null;
}): Promise<ActionResult<Quote>> {
  return safeAction(async () => {
    const user = await requireUser();
    const s = await buildCheckout({ user, group: input.group ?? null, addressId: input.addressId, couponCode: input.couponCode, paymentMethod: input.paymentMethod ?? null });
    return {
      totals: s.totals,
      availability: s.availability,
      coupon: s.coupon ? { code: s.coupon.code, discount: s.coupon.discount, freeShipping: s.coupon.freeShipping } : null,
      couponError: s.couponError,
      problems: s.problems,
    };
  });
}

export async function placeOrderAction(input: {
  addressId: string;
  paymentMethod: "ONLINE" | "COD";
  couponCode?: string | null;
  group?: "ONLINE" | "COD" | null;
  checkoutKey: string;
  note?: string | null;
}): Promise<ActionResult<PlaceOrderResult>> {
  return safeAction(async () => {
    const user = await requireUser();
    if (!/^[A-Za-z0-9-]{16,64}$/.test(input.checkoutKey ?? "")) throw new AppError("Invalid checkout session. Please refresh the page.");
    if (input.paymentMethod !== "ONLINE" && input.paymentMethod !== "COD") throw new AppError("Choose a payment method.");
    return placeOrder(user, input);
  });
}

/** "Payment failed — try again": opens a fresh Razorpay order for the same (still reserved) order. */
export async function retryPaymentAction(orderNumber: string): Promise<ActionResult<RazorpayCheckoutParams>> {
  return safeAction(async () => {
    const user = await requireUser();
    const order = await db.order.findUnique({ where: { orderNumber } });
    if (!order || order.userId !== user.id) throw new AppError("Order not found.");
    return createPaymentAttempt(order.id, user);
  });
}

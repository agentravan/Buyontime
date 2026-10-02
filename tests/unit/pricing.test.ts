import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, evaluateCoupon, walletUsable } from "@/lib/pricing";
import { formatINR, gstIncluded, toPaise } from "@/lib/money";

const s = { freeShippingThreshold: 49900, standardShippingFee: 4900, codFee: 2000 };

test("₹999 is sent to Razorpay as 99900 paise", () => {
  assert.equal(toPaise(999), 99900);
  assert.equal(toPaise("549.50"), 54950);
  assert.equal(formatINR(99900), "₹999");
});

test("shipping is charged below the free-shipping threshold", () => {
  const t = computeTotals([{ unitPrice: 19900, quantity: 2, gstRate: 18 }], s);
  assert.equal(t.subtotal, 39800);
  assert.equal(t.shippingFee, 4900);
  assert.equal(t.total, 44700);
  assert.equal(t.freeShippingRemaining, 10100);
});

test("free shipping at/above threshold; COD fee only for COD", () => {
  const online = computeTotals([{ unitPrice: 54900, quantity: 1, gstRate: 18 }], s, { paymentMethod: "ONLINE" });
  const cod = computeTotals([{ unitPrice: 54900, quantity: 1, gstRate: 18 }], s, { paymentMethod: "COD" });
  assert.equal(online.shippingFee, 0);
  assert.equal(online.total, 54900);
  assert.equal(cod.total, 56900);
});

test("coupon discount reduces total and GST proportionally", () => {
  const t = computeTotals([{ unitPrice: 100000, quantity: 1, gstRate: 18 }], s, { discount: 10000 });
  assert.equal(t.total, 90000);
  assert.equal(t.gstAmount, gstIncluded(90000, 18));
});

const base = { type: "PERCENTAGE" as const, value: 10, minOrder: 49900, maxDiscount: 15000, expiresAt: null, usageLimit: null, perUserLimit: 1, usedCount: 0, isActive: true };

test("percentage coupon respects max discount and min order", () => {
  assert.deepEqual(evaluateCoupon(base, 100000, 0), { ok: true, discount: 10000, freeShipping: false });
  assert.deepEqual(evaluateCoupon(base, 300000, 0), { ok: true, discount: 15000, freeShipping: false });
  assert.equal(evaluateCoupon(base, 30000, 0).ok, false);
});

test("coupon rejects expired, exhausted, inactive, and reused", () => {
  assert.equal(evaluateCoupon({ ...base, expiresAt: new Date(Date.now() - 1000) }, 100000, 0).ok, false);
  assert.equal(evaluateCoupon({ ...base, usageLimit: 5, usedCount: 5 }, 100000, 0).ok, false);
  assert.equal(evaluateCoupon({ ...base, isActive: false }, 100000, 0).ok, false);
  assert.equal(evaluateCoupon(base, 100000, 1).ok, false);
});

test("fixed coupon never exceeds subtotal", () => {
  assert.deepEqual(evaluateCoupon({ ...base, type: "FIXED", value: 50000, minOrder: 0, maxDiscount: null }, 30000, 0), { ok: true, discount: 30000, freeShipping: false });
});

test("wallet pays at most its share of an order and always leaves ₹1 to pay", () => {
  assert.equal(walletUsable(50000, 100000, 50), 25000);   // 50% cap
  assert.equal(walletUsable(50000, 10000, 50), 10000);    // balance smaller than the cap
  assert.equal(walletUsable(50000, 100000, 100), 49900);  // never the whole order
  assert.equal(walletUsable(50000, 0, 50), 0);
  assert.equal(walletUsable(100, 5000, 50), 0);           // nothing to split on a ₹1 order
  assert.equal(walletUsable(50000, 5000, 0), 0);
});

test("wallet comes off the amount payable, after coupon, delivery and COD charge", () => {
  const items = [{ unitPrice: 34900, quantity: 1, gstRate: 5 }];
  const none = computeTotals(items, s, { paymentMethod: "COD" });
  assert.equal(none.wallet, 0);
  assert.equal(none.total, 34900 + 4900 + 2000);
  const w = computeTotals(items, s, { paymentMethod: "COD", wallet: { balance: 7500, maxPercent: 50 } });
  assert.equal(w.wallet, 7500);
  assert.equal(w.total, none.total - 7500);
  assert.equal(w.gstAmount, none.gstAmount); // wallet is a way of paying, not a discount
  const capped = computeTotals(items, s, { paymentMethod: "ONLINE", wallet: { balance: 900000, maxPercent: 50 } });
  assert.equal(capped.wallet, Math.floor((34900 + 4900) / 2));
  assert.equal(capped.wallet + capped.total, 34900 + 4900);
});

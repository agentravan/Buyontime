import { test } from "node:test";
import assert from "node:assert/strict";
import { dealRank, dealUnitPrice, grantedSegments, pickSegment, publicSegments, spinsAllowed, totalWeight, type Deal } from "@/lib/spin";
import { computeTotals, evaluateCoupon } from "@/lib/pricing";

const weights = { spinWeight10: 60, spinWeight20: 25, spinWeight30: 5, spinWeightFreeDelivery: 10, spinWeightVoucher: 0 };

test("the gift voucher is not on the wheel unless this spin can win it", () => {
  // switched off (weight 0): never shown, even if the caller says a voucher is available
  assert.ok(publicSegments(weights, { amount: 10000 }).every((s) => s.prize !== "GIFT_VOUCHER"));
  // switched on, but this spin is not eligible (first free spin / monthly limit reached)
  assert.ok(publicSegments({ ...weights, spinWeightVoucher: 2 }, null).every((s) => s.prize !== "GIFT_VOUCHER"));
  // switched on and eligible: shown, with its real chance, and it can be picked
  const segs = publicSegments({ ...weights, spinWeightVoucher: 2 }, { amount: 10000 });
  const v = segs.find((s) => s.prize === "GIFT_VOUCHER");
  assert.ok(v);
  assert.equal(v?.label, "Amazon ₹100");
  assert.equal(v?.chancePct, 2);
  assert.equal(pickSegment(segs, totalWeight(segs) - 1)?.prize, "GIFT_VOUCHER");
});

test("a prize with weight 0 is removed from the wheel and can never be picked", () => {
  const segs = publicSegments({ ...weights, spinWeight30: 0 });
  assert.ok(segs.every((s) => s.prize !== "DISCOUNT_30"));
  for (let r = 0; r < totalWeight(segs); r++) assert.notEqual(pickSegment(segs, r)?.prize, "DISCOUNT_30");
});

test("every roll lands on a segment and the shares match the weights", () => {
  const segs = publicSegments(weights);
  assert.equal(Math.round(segs.reduce((s, x) => s + x.chancePct, 0)), 100);
  const counts: Record<string, number> = {};
  for (let r = 0; r < totalWeight(segs); r++) {
    const p = pickSegment(segs, r);
    if (!p) throw new Error(`roll ${r} did not land on a segment`);
    counts[p.prize] = (counts[p.prize] ?? 0) + 1;
  }
  assert.deepEqual(counts, { DISCOUNT_10: 60, FREE_DELIVERY: 10, DISCOUNT_20: 25, DISCOUNT_30: 5 });
  assert.equal(pickSegment(segs, totalWeight(segs)), null);
});

test("an admin-given voucher spin always lands on the voucher", () => {
  const segs = grantedSegments(weights, 10000);
  assert.equal(segs.length, 5);
  assert.equal(totalWeight(segs), 1);
  assert.equal(pickSegment(segs, 0)?.prize, "GIFT_VOUCHER");
});

test("one free spin, then N per completed order", () => {
  assert.equal(spinsAllowed(0, 5), 1);
  assert.equal(spinsAllowed(1, 5), 6);
  assert.equal(spinsAllowed(3, 5), 16);
  assert.equal(spinsAllowed(3), 4);
});

test("the best unused deal wins", () => {
  const ds = [{ percent: 10, freeShipping: false }, { percent: null, freeShipping: true }, { percent: 30, freeShipping: false }, { percent: 20, freeShipping: false }];
  assert.equal([...ds].sort((a, b) => dealRank(b) - dealRank(a))[0].percent, 30);
});

const deal: Deal = { code: "SPIN-TEST01", percent: 20, freeShipping: false, minOrder: 49900, maxDiscount: 15000, expiresAt: null };

test("deal price shown on a product matches what checkout will charge", () => {
  assert.equal(dealUnitPrice(99900, deal), 99900 - 15000); // capped
  assert.equal(dealUnitPrice(59900, deal), 59900 - 11980);
  assert.equal(dealUnitPrice(34900, deal), null); // below the coupon's minimum order: no deal price shown
  assert.equal(dealUnitPrice(34900, { ...deal, minOrder: 0 }), 34900 - 6980);
  assert.equal(dealUnitPrice(59900, { ...deal, percent: null, freeShipping: true }), null);
  assert.equal(dealUnitPrice(59900, null), null);
  // same number as the checkout's coupon rule
  const c = { type: "PERCENTAGE" as const, value: 20, minOrder: 49900, maxDiscount: 15000, expiresAt: null, usageLimit: 1, perUserLimit: 1, usedCount: 0, isActive: true };
  const res = evaluateCoupon(c, 59900, 0);
  assert.ok(res.ok && 59900 - res.discount === dealUnitPrice(59900, deal));
});

const s = { freeShippingThreshold: 49900, standardShippingFee: 4900, codFee: 2000 };
const freeDelivery = { type: "FIXED" as const, value: 0, minOrder: 0, maxDiscount: null, expiresAt: null, usageLimit: 1, perUserLimit: 1, usedCount: 0, isActive: true, freeShipping: true };

test("free-delivery coupon waives the delivery charge below the threshold", () => {
  assert.deepEqual(evaluateCoupon(freeDelivery, 34900, 0), { ok: true, discount: 0, freeShipping: true });
  const without = computeTotals([{ unitPrice: 34900, quantity: 1, gstRate: 5 }], s);
  const withCoupon = computeTotals([{ unitPrice: 34900, quantity: 1, gstRate: 5 }], s, { freeShipping: true });
  assert.equal(without.total, 39800);
  assert.equal(withCoupon.shippingFee, 0);
  assert.equal(withCoupon.total, 34900);
  assert.equal(withCoupon.freeShippingRemaining, 0);
});

test("spin discount coupon respects the cap and minimum order, and works once", () => {
  const c = { type: "PERCENTAGE" as const, value: 30, minOrder: 49900, maxDiscount: 15000, expiresAt: null, usageLimit: 1, perUserLimit: 1, usedCount: 0, isActive: true };
  assert.deepEqual(evaluateCoupon(c, 99900, 0), { ok: true, discount: 15000, freeShipping: false });
  assert.equal(evaluateCoupon(c, 34900, 0).ok, false);
  assert.equal(evaluateCoupon({ ...c, usedCount: 1 }, 99900, 0).ok, false);
});

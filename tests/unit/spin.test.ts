import { test } from "node:test";
import assert from "node:assert/strict";
import { creatorSegments, pickSegment, publicSegments, totalWeight } from "@/lib/spin";
import { computeTotals, evaluateCoupon } from "@/lib/pricing";

const weights = { spinWeight10: 60, spinWeight20: 25, spinWeight30: 5, spinWeightFreeDelivery: 10 };

test("public wheel never contains the creator voucher", () => {
  const segs = publicSegments(weights);
  assert.equal(segs.length, 4);
  assert.ok(segs.every((s) => s.prize !== "CREATOR_VOUCHER"));
  assert.equal(Math.round(segs.reduce((s, x) => s + x.chancePct, 0)), 100);
});

test("a prize with weight 0 is removed from the wheel and can never be picked", () => {
  const segs = publicSegments({ ...weights, spinWeight30: 0 });
  assert.ok(segs.every((s) => s.prize !== "DISCOUNT_30"));
  for (let r = 0; r < totalWeight(segs); r++) assert.notEqual(pickSegment(segs, r)?.prize, "DISCOUNT_30");
});

test("every roll lands on a segment and the shares match the weights", () => {
  const segs = publicSegments(weights);
  const counts: Record<string, number> = {};
  for (let r = 0; r < totalWeight(segs); r++) {
    const p = pickSegment(segs, r);
    if (!p) throw new Error(`roll ${r} did not land on a segment`);
    counts[p.prize] = (counts[p.prize] ?? 0) + 1;
  }
  assert.deepEqual(counts, { DISCOUNT_10: 60, FREE_DELIVERY: 10, DISCOUNT_20: 25, DISCOUNT_30: 5 });
  assert.equal(pickSegment(segs, totalWeight(segs)), null);
});

test("creator wheel is a single guaranteed reward", () => {
  const segs = creatorSegments();
  assert.equal(segs.length, 1);
  assert.equal(pickSegment(segs, 0)?.prize, "CREATOR_VOUCHER");
  assert.equal(segs[0].chancePct, 100);
});

const s = { freeShippingThreshold: 49900, standardShippingFee: 4900, codFee: 2000 };
const freeDelivery = { type: "FIXED" as const, value: 0, minOrder: 0, maxDiscount: null, expiresAt: null, usageLimit: 1, perUserLimit: 1, usedCount: 0, isActive: true, freeShipping: true };

test("free-delivery coupon waives the delivery charge below the threshold", () => {
  const res = evaluateCoupon(freeDelivery, 34900, 0);
  assert.deepEqual(res, { ok: true, discount: 0, freeShipping: true });
  const without = computeTotals([{ unitPrice: 34900, quantity: 1, gstRate: 5 }], s);
  const withCoupon = computeTotals([{ unitPrice: 34900, quantity: 1, gstRate: 5 }], s, { freeShipping: true });
  assert.equal(without.total, 39800);
  assert.equal(withCoupon.shippingFee, 0);
  assert.equal(withCoupon.total, 34900);
  assert.equal(withCoupon.freeShippingRemaining, 0);
});

test("spin discount coupon respects the cap and minimum order", () => {
  const c = { type: "PERCENTAGE" as const, value: 30, minOrder: 49900, maxDiscount: 15000, expiresAt: null, usageLimit: 1, perUserLimit: 1, usedCount: 0, isActive: true };
  assert.deepEqual(evaluateCoupon(c, 99900, 0), { ok: true, discount: 15000, freeShipping: false });
  assert.equal(evaluateCoupon(c, 34900, 0).ok, false);
  assert.equal(evaluateCoupon({ ...c, usedCount: 1 }, 99900, 0).ok, false);
});

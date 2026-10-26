import { test } from "node:test";
import assert from "node:assert/strict";
import { landedCost, memberUnitPrice, membershipPeriod, repriceVerdict, rewardAmount, rewardsEarned, suggestedRegularPrice } from "@/lib/membership";

const rule = { enabled: true, memberProfit: 10000, regularProfit: 18000 };
const cost = (rupees: number, ship = 0, other = 0) => ({ costPrice: rupees * 100, shippingCost: ship * 100, otherCost: other * 100 });

test("owner's rule: ₹180 profit for non-members, ₹100 for members (members save ₹80)", () => {
  const c = cost(150, 50); // ₹200 landed
  const regular = suggestedRegularPrice(c, rule)!;
  assert.equal(regular, 38000); // ₹380
  const member = memberUnitPrice(regular, c, rule)!;
  assert.equal(member, 30000); // ₹300
  assert.equal(regular - landedCost(c), 18000);
  assert.equal(member - landedCost(c), 10000);
  assert.equal(regular - member, 8000);
});

test("the ₹100 member profit holds at every cost, cheap or expensive", () => {
  for (const rupees of [99, 239, 380, 1000, 5780]) {
    const c = cost(rupees);
    const regular = suggestedRegularPrice(c, rule)!;
    const member = memberUnitPrice(regular, c, rule)!;
    assert.equal(member - landedCost(c), 10000, `cost ₹${rupees}`);
    assert.equal(regular - landedCost(c), 18000, `cost ₹${rupees}`);
  }
});

test("no member price without a cost, when membership is off, or when it would not be cheaper", () => {
  assert.equal(memberUnitPrice(50000, cost(0), rule), null);
  assert.equal(memberUnitPrice(50000, cost(200), { ...rule, enabled: false }), null);
  assert.equal(memberUnitPrice(30000, cost(200), rule), null); // regular ₹300 = cost + ₹100 already
});

test("paise in the cost are rounded up to a whole rupee, never down", () => {
  const c = { costPrice: 25050, shippingCost: 0, otherCost: 0 }; // ₹250.50
  assert.equal(memberUnitPrice(99900, c, rule), 35100);
  assert.equal(suggestedRegularPrice(c, rule), 43100);
});

test("reprice never goes above MRP and skips products without a cost", () => {
  assert.deepEqual(repriceVerdict({ ...cost(200), price: 29900, mrp: 99900 }, rule), { kind: "change", from: 29900, to: 38000 });
  assert.deepEqual(repriceVerdict({ ...cost(200), price: 29900, mrp: 34900 }, rule), { kind: "above-mrp", price: 38000, mrp: 34900 });
  assert.deepEqual(repriceVerdict({ ...cost(0), price: 29900, mrp: 99900 }, rule), { kind: "no-cost" });
  assert.deepEqual(repriceVerdict({ ...cost(200), price: 38000, mrp: 99900 }, rule), { kind: "same", price: 38000 });
});

test("membership period: 6 or 12 months, renewals stack on the current end date", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  const first = membershipPeriod(now, null, 6);
  assert.equal(first.startsAt.toISOString(), now.toISOString());
  assert.equal(first.endsAt.toISOString(), "2027-04-26T10:00:00.000Z");
  const renewal = membershipPeriod(now, first.endsAt, 12);
  assert.equal(renewal.startsAt.toISOString(), "2027-04-26T10:00:00.000Z");
  assert.equal(renewal.endsAt.toISOString(), "2028-04-26T10:00:00.000Z");
  // An expired membership does not push the start date back.
  assert.equal(membershipPeriod(now, new Date("2026-01-01T00:00:00Z"), 6).startsAt.toISOString(), now.toISOString());
  // 31 Aug + 6 months ends on the last day of February, not in March.
  assert.equal(membershipPeriod(new Date("2026-08-31T00:00:00Z"), null, 6).endsAt.toISOString(), "2027-02-28T00:00:00.000Z");
});

test("a voucher for every 3 delivered member orders", () => {
  assert.equal(rewardsEarned(2, 3), 0);
  assert.equal(rewardsEarned(3, 3), 1);
  assert.equal(rewardsEarned(7, 3), 2);
  assert.equal(rewardsEarned(9, 0), 0);
});

test("voucher amount stays within ₹50–₹200 in ₹10 steps", () => {
  assert.equal(rewardAmount(5000, 20000, () => 0), 5000);
  assert.equal(rewardAmount(5000, 20000, (n) => n - 1), 20000);
  for (let i = 0; i < 200; i++) {
    const a = rewardAmount(5000, 20000, (n) => Math.floor(Math.random() * n));
    assert.ok(a >= 5000 && a <= 20000 && a % 1000 === 0, String(a));
  }
  assert.equal(rewardAmount(10000, 10000, (n) => n - 1), 10000);
});

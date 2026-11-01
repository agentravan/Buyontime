import { test } from "node:test";
import assert from "node:assert/strict";
import { priceForTargetProfit, retailRound, worstCaseUnitProfit, type TargetPriceSettings } from "@/lib/target-price";

const unregistered: TargetPriceSettings = { gstMode: "NOT_REGISTERED", claimInputTaxCredit: false, gatewayFeeBps: 236, packagingCostPerOrder: 1000, codCollectionCharge: 2500 };
const registered: TargetPriceSettings = { ...unregistered, gstMode: "REGISTERED" };
const meesho = { costPrice: 24900, shippingCost: 0, otherCost: 0, gstRate: 5 }; // ₹249 on Meesho

test("retail rounding ends in 9 and never rounds down", () => {
  assert.equal(retailRound(34100), 34900);
  assert.equal(retailRound(34900), 34900);
  assert.equal(retailRound(34901), 35900);
  assert.equal(retailRound(35000), 35900);
});

test("guarantees ≥ ₹120 worst-case profit (COD charge + packaging) for an unregistered store", () => {
  const r = priceForTargetProfit(meesho, unregistered);
  assert.ok(r.profit >= 12000, `profit ${r.profit}`);
  assert.equal(r.price % 1000, 900);
  // one ₹10 step cheaper would miss the target (minimal price)
  assert.ok(worstCaseUnitProfit(r.price - 1000, meesho, unregistered) < 12000);
});

test("accounts for GST when the store is GST-registered", () => {
  const plain = priceForTargetProfit(meesho, unregistered);
  const gst = priceForTargetProfit(meesho, registered);
  assert.ok(gst.price > plain.price);
  assert.ok(gst.profit >= 12000);
});

test("custom targets and costs are respected", () => {
  const r = priceForTargetProfit({ costPrice: 50000, shippingCost: 4000, otherCost: 500, gstRate: 12 }, registered, 20000);
  assert.ok(r.profit >= 20000);
});

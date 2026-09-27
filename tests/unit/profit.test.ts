import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateOrderProfit, calculateUnitProfit, type ProfitOrder, type ProfitSettings } from "@/lib/profit";

const settings: ProfitSettings = { gstMode: "NOT_REGISTERED", claimInputTaxCredit: false, gatewayFeeBps: 236, packagingCostPerOrder: 1000, codCollectionCharge: 2500, codRtoRatePct: 0 };
const item = { quantity: 1, recoveredQuantity: 0, unitCost: 30000, unitShippingCost: 6000, unitOtherCost: 500, gstRate: 5 };
const base: ProfitOrder = { status: "DELIVERED", paymentMethod: "ONLINE", paymentStatus: "PAID", total: 69900, gstAmount: 3329, items: [item], refunded: 0, gatewayFeeActual: null, shippingActual: null, returnShippingActual: null };

const line = (r: ReturnType<typeof calculateOrderProfit>, key: string) => r.lines.find((l) => l.key === key)?.amount;

test("delivered online order: revenue − cost − shipping − other − gateway fee", () => {
  const r = calculateOrderProfit(base, settings);
  assert.equal(r.revenue, 69900);
  assert.equal(line(r, "productCost"), -30000);
  assert.equal(line(r, "shipping"), -6000);
  assert.equal(line(r, "other"), -1500);
  assert.equal(line(r, "gateway"), -Math.round(69900 * 0.0236));
  assert.equal(r.profit, 69900 - 30000 - 6000 - 1500 - Math.round(69900 * 0.0236));
  assert.equal(r.isEstimate, false);
});

test("actual Razorpay fee and courier cost override estimates", () => {
  const r = calculateOrderProfit({ ...base, gatewayFeeActual: 1650, shippingActual: 5200 }, settings);
  assert.equal(line(r, "gateway"), -1650);
  assert.equal(line(r, "shipping"), -5200);
});

test("GST registered: output GST deducted, ITC credited", () => {
  const r = calculateOrderProfit(base, { ...settings, gstMode: "REGISTERED", claimInputTaxCredit: true });
  assert.equal(line(r, "gst"), -3329);
  assert.ok((line(r, "itc") ?? 0) > 0);
});

test("COD RTO: no revenue, goods recovered, two-way shipping lost", () => {
  const r = calculateOrderProfit({ ...base, paymentMethod: "COD", paymentStatus: "CANCELLED", status: "RTO" }, settings);
  assert.equal(r.revenue, 0);
  assert.equal(line(r, "productCost"), -0);
  assert.equal(line(r, "shipping"), -6000);
  assert.equal(line(r, "rto"), -6000);
  assert.ok(r.profit < 0);
});

test("open COD order includes RTO provision when configured", () => {
  const r = calculateOrderProfit({ ...base, paymentMethod: "COD", paymentStatus: "PENDING", status: "SHIPPED" }, { ...settings, codRtoRatePct: 20 });
  assert.equal(line(r, "rtoProvision"), -Math.round(12000 * 0.2));
  assert.equal(r.isEstimate, true);
});

test("cancelled unpaid order has zero profit; cancelled after online payment loses the fee", () => {
  assert.equal(calculateOrderProfit({ ...base, status: "CANCELLED", paymentStatus: "CANCELLED" }, settings).profit, 0);
  const refunded = calculateOrderProfit({ ...base, status: "CANCELLED", paymentStatus: "REFUNDED", refunded: 69900, gatewayFeeActual: 1650 }, settings);
  assert.equal(refunded.profit, -1650);
});

test("resellable return recovers product cost; refund reduces revenue", () => {
  const r = calculateOrderProfit({ ...base, status: "RETURNED", refunded: 69900, items: [{ ...item, recoveredQuantity: 1 }], returnShippingActual: 7000 }, settings);
  assert.equal(r.revenue, 0);
  assert.equal(line(r, "productCost"), -0);
  assert.equal(line(r, "rto"), -7000);
});

test("unit profit = price − cost − shipping − other − fee", () => {
  const u = calculateUnitProfit({ price: 54900, costPrice: 24000, shippingCost: 5000, otherCost: 500, gstRate: 18 }, settings, "ONLINE");
  assert.equal(u.profit, 54900 - 24000 - 5000 - 500 - Math.round(54900 * 0.0236));
  const cod = calculateUnitProfit({ price: 54900, costPrice: 24000, shippingCost: 5000, otherCost: 500, gstRate: 18 }, settings, "COD");
  assert.equal(cod.gateway, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFLICT_MESSAGE, resolvePaymentMethods, type PaymentRuleSettings } from "@/lib/payment-rules";

const settings: PaymentRuleSettings = {
  onlinePaymentEnabled: true, codEnabled: true, codMaxOrderValue: null, codMinOrderValue: 0, codBlockedPincodes: [], mixedCartPolicy: "SPLIT_ORDERS",
};
const A = { productId: "a", name: "Product A", paymentOption: "ONLINE_ONLY" as const };
const B = { productId: "b", name: "Product B", paymentOption: "COD_ONLY" as const };
const C = { productId: "c", name: "Product C", paymentOption: "ONLINE_AND_COD" as const };

test("Product A (ONLINE_ONLY) shows only Pay Online", () => {
  const r = resolvePaymentMethods({ settings, gatewayConfigured: true, items: [A] });
  assert.deepEqual(r.methods, ["ONLINE"]);
  assert.equal(r.cod.allowed, false);
});

test("Product B (COD_ONLY) shows only Cash on Delivery", () => {
  const r = resolvePaymentMethods({ settings, gatewayConfigured: true, items: [B] });
  assert.deepEqual(r.methods, ["COD"]);
  assert.equal(r.online.allowed, false);
});

test("Product C (ONLINE_AND_COD) shows both", () => {
  const r = resolvePaymentMethods({ settings, gatewayConfigured: true, items: [C] });
  assert.deepEqual(r.methods, ["ONLINE", "COD"]);
});

test("A + B in one cart is a conflict with split groups", () => {
  const r = resolvePaymentMethods({ settings, gatewayConfigured: true, items: [A, B, C] });
  assert.equal(r.conflict, true);
  assert.deepEqual(r.methods, []);
  assert.equal(r.message, CONFLICT_MESSAGE);
  assert.deepEqual(r.groups.ONLINE, ["a", "c"]);
  assert.deepEqual(r.groups.COD, ["b", "c"]);
});

test("A + C narrows to online only (common method)", () => {
  const r = resolvePaymentMethods({ settings, gatewayConfigured: true, items: [A, C] });
  assert.equal(r.conflict, false);
  assert.deepEqual(r.methods, ["ONLINE"]);
});

test("store-level switches override product rules", () => {
  assert.deepEqual(resolvePaymentMethods({ settings: { ...settings, codEnabled: false }, gatewayConfigured: true, items: [C] }).methods, ["ONLINE"]);
  assert.deepEqual(resolvePaymentMethods({ settings: { ...settings, onlinePaymentEnabled: false }, gatewayConfigured: true, items: [C] }).methods, ["COD"]);
  assert.deepEqual(resolvePaymentMethods({ settings, gatewayConfigured: false, items: [C] }).methods, ["COD"]);
  const none = resolvePaymentMethods({ settings: { ...settings, codEnabled: false }, gatewayConfigured: true, items: [B] });
  assert.deepEqual(none.methods, []);
  assert.ok(none.message);
});

test("COD restrictions: customer, pincode, order value", () => {
  assert.equal(resolvePaymentMethods({ settings, gatewayConfigured: true, items: [C], customer: { codBlocked: true } }).cod.allowed, false);
  assert.equal(resolvePaymentMethods({ settings: { ...settings, codBlockedPincodes: ["110001"] }, gatewayConfigured: true, items: [C], pincode: "110001" }).cod.allowed, false);
  assert.equal(resolvePaymentMethods({ settings: { ...settings, codMaxOrderValue: 100000 }, gatewayConfigured: true, items: [C], orderTotal: 150000 }).cod.allowed, false);
  assert.equal(resolvePaymentMethods({ settings: { ...settings, codMaxOrderValue: 100000 }, gatewayConfigured: true, items: [C], orderTotal: 90000 }).cod.allowed, true);
});

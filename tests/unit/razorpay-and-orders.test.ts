import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { checkoutSignatureValid, webhookSignatureValid } from "@/lib/razorpay-signature";
import { buildTimeline, canTransition } from "@/lib/order-status";

const secret = "test_secret_123";

test("valid checkout signature is accepted", () => {
  const sig = createHmac("sha256", secret).update("order_ABC|pay_XYZ").digest("hex");
  assert.equal(checkoutSignatureValid("order_ABC", "pay_XYZ", sig, secret), true);
});

test("tampered checkout signature / ids / secret are rejected", () => {
  const sig = createHmac("sha256", secret).update("order_ABC|pay_XYZ").digest("hex");
  assert.equal(checkoutSignatureValid("order_ABC", "pay_OTHER", sig, secret), false);
  assert.equal(checkoutSignatureValid("order_ABC", "pay_XYZ", sig.replace(/.$/, "0"), secret), false);
  assert.equal(checkoutSignatureValid("order_ABC", "pay_XYZ", sig, "wrong"), false);
  assert.equal(checkoutSignatureValid("order_ABC", "pay_XYZ", "", secret), false);
  assert.equal(checkoutSignatureValid("order_ABC", "pay_XYZ", sig, ""), false);
});

test("webhook signature covers the exact raw body", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });
  const sig = createHmac("sha256", "whsec").update(body).digest("hex");
  assert.equal(webhookSignatureValid(body, sig, "whsec"), true);
  assert.equal(webhookSignatureValid(body + " ", sig, "whsec"), false);
  assert.equal(webhookSignatureValid(body, sig, ""), false);
});

test("order state machine", () => {
  assert.equal(canTransition("CONFIRMED", "PROCESSING"), true);
  assert.equal(canTransition("PROCESSING", "SHIPPED"), true);
  assert.equal(canTransition("SHIPPED", "OUT_FOR_DELIVERY"), true);
  assert.equal(canTransition("OUT_FOR_DELIVERY", "DELIVERED"), true);
  assert.equal(canTransition("DELIVERED", "CANCELLED"), false);
  assert.equal(canTransition("SHIPPED", "CANCELLED"), false);
  assert.equal(canTransition("PENDING_PAYMENT", "SHIPPED"), false);
});

test("timeline: online paid order vs COD", () => {
  const d = new Date();
  const online = buildTimeline({ status: "SHIPPED", paymentMethod: "ONLINE", paymentStatus: "PAID", createdAt: d, paidAt: d, confirmedAt: d, deliveredAt: null });
  assert.deepEqual(online.filter((s) => s.done).map((s) => s.label), ["Order Placed", "Payment Confirmed", "Order Confirmed", "Processing", "Shipped"]);
  assert.equal(online.find((s) => s.current)?.label, "Shipped");
  const pending = buildTimeline({ status: "PENDING_PAYMENT", paymentMethod: "ONLINE", paymentStatus: "PENDING", createdAt: d, paidAt: null, confirmedAt: null, deliveredAt: null });
  assert.deepEqual(pending.filter((s) => s.done).map((s) => s.label), ["Order Placed"]);
  const cod = buildTimeline({ status: "CONFIRMED", paymentMethod: "COD", paymentStatus: "PENDING", createdAt: d, paidAt: null, confirmedAt: d, deliveredAt: null });
  assert.equal(cod[1].label, "Pay on Delivery");
});

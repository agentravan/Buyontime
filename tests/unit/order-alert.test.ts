import { test } from "node:test";
import assert from "node:assert/strict";
import { alertRecipients, renderOrderAlert } from "@/lib/notifications/order-alert";

const order = {
  id: "ord_1", orderNumber: "BOT260928ABC123", createdAt: new Date("2026-09-28T04:30:00Z"),
  customerName: "Priya <Nair>", email: "priya@example.com", phone: "9812345678",
  shippingAddress: { name: "Priya Nair", phone: "9876500000", line1: "12 MG Road", line2: "Flat 4B", landmark: "Near Metro", city: "Gurugram", state: "Haryana", pincode: "122001" },
  paymentMethod: "COD", paymentStatus: "PENDING", subtotal: 129800, discount: 10000, shippingFee: 0, codFee: 2000, total: 121800,
  couponCode: "FLAT100", customerNote: null,
  items: [
    { name: "Hand-block Printed Cotton Kurta", variantName: "M", sku: "BOT-KUR-001-M", quantity: 2, unitPrice: 49900, lineTotal: 99800, productSlug: "hand-block-printed-cotton-kurta", sourceName: "Meesho" },
    { name: "Insulated Steel Water Bottle 1L", variantName: "Default", sku: "BOT-BTL-001", quantity: 1, unitPrice: 30000, lineTotal: 30000, productSlug: "insulated-steel-water-bottle-1l" },
  ],
};

test("order alert contains customer, phone, full address, products with links and totals", () => {
  const { subject, html, text } = renderOrderAlert({ storeName: "Buyontime", appUrl: "https://shop.example/", kind: "COD", order });
  assert.match(subject, /New COD order BOT260928ABC123/);
  assert.match(subject, /₹1,218/);
  for (const s of ["9876500000", "12 MG Road, Flat 4B", "Landmark: Near Metro", "Gurugram, Haryana - 122001", "priya@example.com",
    "https://shop.example/products/hand-block-printed-cotton-kurta", "https://shop.example/products/insulated-steel-water-bottle-1l",
    "Qty 2 × ₹499 = ₹998", "TOTAL ₹1,218", "Discount (FLAT100) −₹100", "COD fee ₹20", "Cash on Delivery — collect ₹1,218",
    "https://shop.example/admin/orders/ord_1", "Source: Meesho"]) {
    assert.ok(text.includes(s), `text is missing: ${s}`);
  }
  assert.ok(html.includes('href="https://shop.example/products/hand-block-printed-cotton-kurta"'));
  assert.ok(html.includes('href="tel:9876500000"'));
  assert.ok(html.includes("Size/option: <b>M</b>"));
  assert.ok(!html.includes("Size/option: <b>Default</b>"), "the Default variant is not shown as an option");
  assert.ok(html.includes("Priya &lt;Nair&gt;") && !html.includes("Priya <Nair>"), "customer input is HTML-escaped");
  assert.match(text, /28 Sept? 2026, 10:00\s?am IST/i);
});

test("paid online orders say so and include the Razorpay payment id", () => {
  const { subject, text } = renderOrderAlert({ storeName: "Buyontime", appUrl: "https://shop.example", kind: "PAID", order: { ...order, codFee: 0, total: 119800, razorpayPaymentId: "pay_ABC" } });
  assert.match(subject, /New paid order/);
  assert.ok(text.includes("Paid online (Razorpay pay_ABC) — ₹1,198"));
});

test("alert recipients: comma/space separated, validated, lowercased, max 5", () => {
  assert.deepEqual(alertRecipients("Teamwork.HRsolution@zohomail.in, bad-address; second@x.in"), ["teamwork.hrsolution@zohomail.in", "second@x.in"]);
  assert.deepEqual(alertRecipients(null), []);
  assert.equal(alertRecipients("a@x.in b@x.in c@x.in d@x.in e@x.in f@x.in").length, 5);
});

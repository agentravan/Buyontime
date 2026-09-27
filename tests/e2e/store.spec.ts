import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Full business-flow E2E suite. Runs serially against a production build + Razorpay test double.
 * Every assertion that matters for money is checked in the database, not just in the UI.
 */

const db = new PrismaClient();
const RZP = process.env.RZP_DOUBLE_URL ?? "http://127.0.0.1:4010";
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e_cron_secret";
const RUN = process.env.E2E_RUN_ID ?? Date.now().toString(36);
const PW = "Test@12345";
const ADMIN = { email: "admin@buyontime.test", password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345" };
const SUPPLIER = { email: "supplier@buyontime.test", password: process.env.SEED_SUPPLIER_PASSWORD ?? "Supplier@12345" };

const PRODUCT_A = "aurora-pro-wireless-earbuds-with-enc"; // ONLINE_ONLY
const PRODUCT_B = "hand-block-printed-cotton-kurta"; // COD_ONLY (variants)
const PRODUCT_C = "insulated-steel-water-bottle-1l"; // ONLINE_AND_COD

test.afterAll(async () => { await db.$disconnect(); });

/** Replaces Razorpay's checkout.js with a stand-in that "pays" through the test double. */
async function stubRazorpay(page: Page, outcome: "success" | "fail" | "pay-then-close" | "dismiss") {
  await page.addInitScript((o) => { (window as unknown as { __RZP_OUTCOME: string }).__RZP_OUTCOME = o; }, outcome);
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Razorpay = function (opts) {
        var failCb = null;
        this.on = function (ev, cb) { if (ev === "payment.failed") failCb = cb; };
        this.open = async function () {
          var outcome = window.__RZP_OUTCOME || "success";
          if (outcome === "dismiss") { opts.modal.ondismiss(); return; }
          var r = await fetch("${RZP}/test/pay", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: opts.order_id, amount: opts.amount, outcome: outcome === "fail" ? "fail" : "success" }) }).then(function (x) { return x.json(); });
          window.__RZP_LAST = r;
          if (outcome === "success") return opts.handler(r);
          if (outcome === "fail" && failCb) failCb(r);
          opts.modal.ondismiss();
        };
      };`,
    }),
  );
}

async function register(page: Page, email: string, name = "E2E Shopper") {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill("9876501234");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/account");
}

async function login(page: Page, email: string, password: string, admin = false) {
  await page.goto(admin ? "/admin/login" : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(admin ? "**/admin/dashboard" : "**/account");
}

async function addToCart(page: Page, slug: string, option?: string, qty = 1) {
  await page.goto(`/products/${slug}`);
  if (option) await page.getByRole("button", { name: option, exact: true }).click();
  for (let i = 1; i < qty; i++) await page.getByRole("button", { name: "Increase quantity" }).click();
  // The first "Add to cart" on the page is the product's own buy box (rails below have their own buttons).
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByText("Added to cart").first()).toBeVisible();
}

async function ensureAddress(page: Page) {
  await page.goto("/checkout");
  await page.waitForLoadState("networkidle");
  const form = page.getByLabel("Flat, house no., building, street");
  if (await form.isVisible().catch(() => false)) {
    await page.getByLabel("Full name").fill("E2E Shopper");
    await page.getByLabel("Mobile number").fill("9876501234");
    await form.fill("221B Test Street, Sector 45");
    await page.getByLabel("Pincode").fill("122003");
    await page.getByLabel("City").fill("Gurugram");
    await page.getByLabel("State").selectOption("Haryana");
    await page.getByRole("button", { name: "Save and deliver here" }).click();
    await expect(page.getByRole("radio", { name: /221B Test Street/ })).toBeChecked();
    await page.waitForLoadState("networkidle");
  }
}

async function placeOrder(page: Page, method: "COD" | "ONLINE") {
  await page.getByText(method === "COD" ? "💵 Cash on Delivery" : "💳 Pay Online").click();
  const btn = method === "COD" ? page.getByRole("button", { name: "Place order" }) : page.getByRole("button", { name: /^Pay ₹/ });
  try {
    await expect(btn).toBeEnabled();
  } catch {
    throw new Error(`Place/Pay button stayed disabled. Checkout page says:\n${(await page.locator("main").innerText()).slice(0, 2500)}`);
  }
  await btn.click();
}

async function latestOrder(email: string) {
  return db.order.findFirstOrThrow({ where: { user: { email } }, orderBy: { createdAt: "desc" }, include: { payments: { orderBy: { createdAt: "asc" } }, items: true, refunds: true } });
}

async function stock(sku: string) {
  return (await db.productVariant.findUniqueOrThrow({ where: { sku } })).stock;
}

async function rzpWebhook(body: Record<string, unknown>) {
  const r = await fetch(`${RZP}/test/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()) as { status: number; body: { ok: boolean; duplicate?: boolean } };
}

async function newCustomer(browser: Browser, tag: string) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const email = `${tag}-${RUN}@e2e.test`;
  await register(page, email);
  return { ctx, page, email };
}

// ───────────────────────────── Accounts ─────────────────────────────

test("customer can register, log out and log in again", async ({ page }) => {
  const email = `reg-${RUN}@e2e.test`;
  await register(page, email, "Registration Tester");
  await expect(page.getByText("Welcome back, Registration!")).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { email } })).role).toBe("CUSTOMER");
  // Welcome notification (in-app) was created.
  expect(await db.notification.count({ where: { user: { email }, event: "WELCOME" } })).toBe(1);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
  await page.goto("/account");
  await page.waitForURL("**/login?next=%2Faccount");
  await login(page, email, PW);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
});

test("wrong password is rejected without revealing whether the account exists", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("customer@buyontime.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Incorrect email or password.");
});

// ───────────────────────────── Catalogue ─────────────────────────────

test("browse, search, filter, sort and open a product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shop by category" })).toBeVisible();
  await page.getByPlaceholder("Search for products, brands and more").first().fill("bottle");
  await page.getByPlaceholder("Search for products, brands and more").first().press("Enter");
  await expect(page.getByRole("heading", { name: "Results for “bottle”" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Insulated Steel Water Bottle 1L" }).first()).toBeVisible();
  await page.goto("/products?category=footwear&sort=price_asc");
  await expect(page.getByRole("heading", { name: "Footwear" })).toBeVisible();
  const prices = await page.locator("a[href^='/products/'] >> xpath=..").count();
  expect(prices).toBeGreaterThan(0);
  await page.goto("/products?onSale=1&min=1000");
  await expect(page.getByText(/products$/).first()).toBeVisible();
  await page.goto(`/products/${PRODUCT_C}`);
  await expect(page.getByRole("heading", { name: "Insulated Steel Water Bottle 1L" })).toBeVisible();
  await expect(page.getByText("Inclusive of all taxes")).toBeVisible();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
});

// ───────────────────── Payment method control (A / B / C) ─────────────────────

test("checkout shows ONLY the payment methods each product allows", async ({ browser }) => {
  const { ctx, page } = await newCustomer(browser, "paymethods");
  await stubRazorpay(page, "dismiss");

  await addToCart(page, PRODUCT_A);
  await ensureAddress(page);
  await expect(page.getByText("💳 Pay Online")).toBeVisible();
  await expect(page.getByText("💵 Cash on Delivery")).toHaveCount(0);

  // Replace A with B
  await page.goto("/cart");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Your cart is empty")).toBeVisible();
  await addToCart(page, PRODUCT_B, "M");
  await page.goto("/checkout");
  await expect(page.getByText("💵 Cash on Delivery")).toBeVisible();
  await expect(page.getByText("💳 Pay Online")).toHaveCount(0);

  await page.goto("/cart");
  await page.getByRole("button", { name: "Remove" }).click();
  await addToCart(page, PRODUCT_C);
  await page.goto("/checkout");
  await expect(page.getByText("💳 Pay Online")).toBeVisible();
  await expect(page.getByText("💵 Cash on Delivery")).toBeVisible();

  // Mixed cart: A (online only) + B (COD only) → clear message, separate orders
  await addToCart(page, PRODUCT_A);
  await addToCart(page, PRODUCT_B, "L");
  await page.goto("/cart");
  await expect(page.getByText("Some products in your cart have different payment requirements. Please place separate orders.")).toBeVisible();
  await page.goto("/checkout");
  await page.waitForURL("**/cart");
  await page.getByRole("link", { name: "Checkout COD items" }).click();
  await expect(page.getByText("Checking out Cash-on-Delivery items only.")).toBeVisible();
  await expect(page.getByText("💵 Cash on Delivery")).toBeVisible();
  await expect(page.getByText("💳 Pay Online")).toHaveCount(0);
  await expect(page.getByText("Hand-block Printed Cotton Kurta", { exact: true })).toBeVisible();
  await expect(page.getByText("Aurora Pro Wireless Earbuds with ENC", { exact: true })).toHaveCount(0);
  await ctx.close();
});

// ───────────────────────────── COD flow ─────────────────────────────

const codCustomerEmail = `cod-${RUN}@e2e.test`;
const onlineEmail = `online-${RUN}@e2e.test`;
const codOrderIdOf = async () => (await latestOrder(codCustomerEmail)).id;
const onlineOrderIdOf = async () => (await latestOrder(onlineEmail)).id;

test("COD: order created, inventory updated, customer sees confirmation, admin fulfils", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "cod");
  const sku = "BOT-KUR-001-M";
  const before = await stock(sku);
  await addToCart(page, PRODUCT_B, "M", 2);
  await ensureAddress(page);
  await placeOrder(page, "COD");
  await page.waitForURL("**/checkout/success/**");
  await expect(page.getByRole("heading", { name: "Order placed successfully" })).toBeVisible();

  const order = await latestOrder(email);
  expect(order.paymentMethod).toBe("COD");
  expect(order.paymentStatus).toBe("PENDING");
  expect(order.status).toBe("CONFIRMED");
  expect(order.stockState).toBe("COMMITTED");
  expect(order.orderNumber).toMatch(/^BOT\d{6}[A-Z0-9]{6}$/);
  expect(await stock(sku)).toBe(before - 2);
  expect(await db.notification.count({ where: { userId: order.userId, event: "ORDER_CREATED" } })).toBe(1);
  expect(await db.notification.count({ where: { audience: "ADMIN", event: "ADMIN_COD_ORDER", dedupeKey: { contains: order.id } } })).toBe(1);
  // Cart was cleared of the purchased item.
  await page.goto("/cart");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
  await ctx.close();

  // Admin sees and fulfils the order.
  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await login(ap, ADMIN.email, ADMIN.password, true);
  await ap.goto(`/admin/orders?q=${order.orderNumber}`);
  await expect(ap.getByRole("link", { name: order.orderNumber })).toBeVisible();
  await ap.goto(`/admin/orders/${order.id}`);
  await ap.getByRole("button", { name: "Mark processing" }).click();
  await ap.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(ap.getByText("Order updated").first()).toBeVisible();
  await ap.getByRole("button", { name: "Mark shipped" }).click();
  const dlg = ap.getByRole("dialog");
  await dlg.getByLabel("Courier").fill("Delhivery");
  await dlg.getByLabel("Tracking number").fill(`DLV${RUN}`);
  await dlg.getByLabel("Tracking URL").fill("https://www.delhivery.com/track");
  await dlg.getByRole("button", { name: "Confirm" }).click();
  await expect(ap.getByText(`DLV${RUN}`).first()).toBeVisible();
  await ap.getByRole("button", { name: "Mark out for delivery" }).click();
  await ap.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(ap.getByRole("button", { name: "Mark delivered" })).toBeVisible();
  await ap.getByRole("button", { name: "Mark delivered" }).click();
  await ap.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(ap.getByRole("button", { name: "Mark COD collected" })).toBeVisible();
  // COD must NOT be paid just because it was delivered (setting off by default).
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PENDING");
  await ap.getByRole("button", { name: "Mark COD collected" }).click();
  await ap.getByRole("button", { name: "Mark collected" }).click();
  await expect(ap.getByText("Marked as collected").first()).toBeVisible();

  const done = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { shipment: true, events: true } });
  expect(done.status).toBe("DELIVERED");
  expect(done.paymentStatus).toBe("PAID");
  expect(done.shipment?.trackingId).toBe(`DLV${RUN}`);
  for (const ev of ["ORDER_PROCESSING", "ORDER_SHIPPED", "OUT_FOR_DELIVERY", "ORDER_DELIVERED"]) {
    expect(await db.notification.count({ where: { userId: done.userId, event: ev } })).toBe(1);
  }
  expect(await db.auditLog.count({ where: { entityId: order.id, action: "order.status_change" } })).toBe(4);
  expect(await db.auditLog.count({ where: { entityId: order.id, action: "payment.cod_collected" } })).toBe(1);
  await admin.close();
});

test("customer tracks the order with a professional timeline", async ({ browser }) => {
  const codOrderId = await codOrderIdOf();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, codCustomerEmail, PW);
  const order = await db.order.findUniqueOrThrow({ where: { id: codOrderId } });
  await page.goto(`/account/orders/${order.orderNumber}`);
  for (const step of ["Order Placed", "Cash Collected", "Order Confirmed", "Processing", "Shipped", "Out for Delivery", "Delivered"]) {
    await expect(page.locator("ol").getByText(step, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(`DLV${RUN}`)).toBeVisible();
  await page.goto("/account/notifications");
  await expect(page.getByText("Order shipped")).toBeVisible();
  await ctx.close();
});

// ───────────────────────────── Online payment ─────────────────────────────


test("ONLINE: Razorpay order → checkout → signature verified server-side → PAID, CONFIRMED, stock committed, notified", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "online");
  await stubRazorpay(page, "success");
  const sku = "BOT-BTL-001";
  const before = await stock(sku);
  await addToCart(page, PRODUCT_C, undefined, 2);
  await ensureAddress(page);
  await placeOrder(page, "ONLINE");
  await page.waitForURL("**/checkout/success/**");
  await expect(page.getByRole("heading", { name: "Payment Successful" })).toBeVisible();
  await expect(page.getByText(/^pay_/)).toBeVisible();

  const order = await latestOrder(email);
  const pay = order.payments[0];
  expect(order.paymentMethod).toBe("ONLINE");
  expect(order.status).toBe("CONFIRMED");
  expect(order.paymentStatus).toBe("PAID");
  expect(order.stockState).toBe("COMMITTED");
  expect(pay.status).toBe("PAID");
  expect(pay.signatureVerified).toBe(true);
  expect(pay.razorpayOrderId).toMatch(/^order_/);
  expect(pay.razorpayPaymentId).toMatch(/^pay_/);
  expect(pay.amount).toBe(order.total); // paise, e.g. ₹1,098 → 109800
  expect(pay.gatewayFee).toBeGreaterThan(0);
  expect(await stock(sku)).toBe(before - 2);
  // The amount sent to Razorpay was in paise.
  const state = (await (await fetch(`${RZP}/test/state`)).json()) as { orders: { id: string; amount: number }[] };
  expect(state.orders.find((o) => o.id === pay.razorpayOrderId)?.amount).toBe(order.total);
  expect(await db.notification.count({ where: { userId: order.userId, event: "PAYMENT_SUCCESS" } })).toBe(1);
  expect(await db.notification.count({ where: { audience: "ADMIN", event: "ADMIN_PAYMENT_RECEIVED", dedupeKey: { contains: order.id } } })).toBe(1);
  await ctx.close();

  // Admin sees PAID without opening Razorpay.
  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await login(ap, ADMIN.email, ADMIN.password, true);
  await ap.goto(`/admin/orders?q=${order.orderNumber}`);
  await expect(ap.getByRole("row").filter({ hasText: order.orderNumber }).getByText("Payment received")).toBeVisible();
  await admin.close();
});

test("duplicate & replayed webhooks create no duplicate payment, stock movement or notification; bad signatures are rejected", async () => {
  const onlineOrderId = await onlineOrderIdOf();
  const order = await db.order.findUniqueOrThrow({ where: { id: onlineOrderId }, include: { payments: true } });
  const pay = order.payments[0];
  const counts = async () => ({
    payments: await db.payment.count({ where: { orderId: order.id } }),
    movements: await db.inventoryMovement.count({ where: { orderId: order.id } }),
    notes: await db.notification.count({ where: { dedupeKey: { contains: order.id } } }),
    deliveries: await db.notificationDelivery.count({ where: { orderId: order.id } }),
    sold: (await db.productVariant.findUniqueOrThrow({ where: { id: order.items?.[0]?.variantId ?? (await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).variantId } })).soldCount,
  });
  const before = await counts();
  const eventId = `evt_dup_${RUN}`;
  const first = await rzpWebhook({ event: "payment.captured", payment_id: pay.razorpayPaymentId, eventId });
  const second = await rzpWebhook({ event: "payment.captured", payment_id: pay.razorpayPaymentId, eventId });
  const orderPaid = await rzpWebhook({ event: "order.paid", payment_id: pay.razorpayPaymentId });
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(second.body.duplicate).toBe(true);
  expect(orderPaid.status).toBe(200);
  expect(await db.webhookEvent.count({ where: { eventId } })).toBe(1);
  expect(await counts()).toEqual(before);

  const bad = await rzpWebhook({ event: "payment.failed", payment_id: pay.razorpayPaymentId, badSignature: true });
  expect(bad.status).toBe(400);
  const late = await rzpWebhook({ event: "payment.failed", payment_id: pay.razorpayPaymentId });
  expect(late.status).toBe(200);
  expect((await db.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("PAID"); // never downgraded
});

test("payment failure → FAILED (never paid) → 'Payment Failed — Try Again' → retry succeeds", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "fail");
  await stubRazorpay(page, "fail");
  await addToCart(page, PRODUCT_A);
  await ensureAddress(page);
  await placeOrder(page, "ONLINE");
  await page.waitForURL("**/account/orders/**");
  await expect(page.getByText("Payment Failed — Try Again").first()).toBeVisible();
  let order = await latestOrder(email);
  expect(order.status).toBe("PENDING_PAYMENT");
  expect(order.paymentStatus).toBe("FAILED");
  expect(order.paymentStatus).not.toBe("PAID");
  expect(order.payments[0].status).toBe("FAILED");
  expect(order.payments[0].failureReason).toContain("declined");
  expect(order.stockState).toBe("RESERVED");
  expect(await db.notification.count({ where: { userId: order.userId, event: "PAYMENT_FAILED" } })).toBe(1);

  await page.evaluate(() => { (window as unknown as { __RZP_OUTCOME: string }).__RZP_OUTCOME = "success"; });
  await page.getByRole("button", { name: "Retry payment" }).click();
  await page.waitForURL("**/checkout/success/**");
  await expect(page.getByRole("heading", { name: "Payment Successful" })).toBeVisible();
  order = await latestOrder(email);
  expect(order.paymentStatus).toBe("PAID");
  expect(order.status).toBe("CONFIRMED");
  expect(order.payments).toHaveLength(2);
  expect(order.payments.map((p) => p.status).sort()).toEqual(["FAILED", "PAID"]);
  await ctx.close();
});

test("webhook alone confirms a payment when the browser never returns", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "webhookonly");
  await stubRazorpay(page, "pay-then-close");
  await addToCart(page, PRODUCT_C);
  await ensureAddress(page);
  await placeOrder(page, "ONLINE");
  await page.waitForURL("**/account/orders/**");
  let order = await latestOrder(email);
  expect(order.paymentStatus).toBe("PENDING");
  const state = (await (await fetch(`${RZP}/test/state`)).json()) as { payments: { id: string; order_id: string }[] };
  const rzpPay = state.payments.find((p) => p.order_id === order.payments[0].razorpayOrderId)!;
  const res = await rzpWebhook({ event: "payment.captured", payment_id: rzpPay.id });
  expect(res.status).toBe(200);
  order = await latestOrder(email);
  expect(order.paymentStatus).toBe("PAID");
  expect(order.status).toBe("CONFIRMED");
  expect(order.payments[0].signatureVerified).toBe(false);
  await ctx.close();
});

test("reconciliation flags Razorpay = PAID vs Database = PENDING and resolves it with an audit trail", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "recon");
  await stubRazorpay(page, "pay-then-close");
  await addToCart(page, PRODUCT_A);
  await ensureAddress(page);
  await placeOrder(page, "ONLINE");
  await page.waitForURL("**/account/orders/**");
  await ctx.close();
  const order = await latestOrder(email);
  expect(order.paymentStatus).toBe("PENDING"); // captured at Razorpay, but no callback/webhook reached us

  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await login(ap, ADMIN.email, ADMIN.password, true);
  await ap.goto(`/admin/payments?q=${order.orderNumber}`);
  await ap.getByRole("button", { name: "Check" }).click();
  await expect(ap.getByText("PAYMENT RECONCILIATION REQUIRED")).toBeVisible();
  await expect(ap.getByText("Razorpay = PAID, Database = PENDING").first()).toBeVisible();
  let pay = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
  expect(pay.reconciliationStatus).toBe("MISMATCH");
  expect(pay.status).toBe("PENDING"); // never silently overwritten

  await ap.getByRole("button", { name: "Apply Razorpay status" }).click();
  await ap.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(ap.getByText("Reconciled").first()).toBeVisible();
  pay = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
  expect(pay.status).toBe("PAID");
  expect(pay.reconciliationStatus).toBe("RESOLVED");
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CONFIRMED");
  expect(await db.auditLog.count({ where: { entityId: pay.id, action: "payment.reconciliation_resolve" } })).toBe(1);
  await admin.close();
});

test("refund via Razorpay API: REFUND_PENDING → webhook refund.processed → PARTIALLY_REFUNDED, customer notified", async ({ browser }) => {
  const onlineOrderId = await onlineOrderIdOf();
  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await login(ap, ADMIN.email, ADMIN.password, true);
  await ap.goto(`/admin/orders/${onlineOrderId}`);
  await ap.getByRole("button", { name: "Refund" }).click();
  const dlg = ap.getByRole("dialog");
  await dlg.getByLabel("Amount (₹)").fill("100");
  await dlg.getByLabel("Reason").fill("Goodwill discount");
  await dlg.getByRole("button", { name: "Refund" }).click();
  await expect(ap.getByText("Refund initiated").first()).toBeVisible();
  let order = await db.order.findUniqueOrThrow({ where: { id: onlineOrderId }, include: { refunds: true } });
  expect(order.paymentStatus).toBe("REFUND_PENDING");
  const refund = order.refunds[0];
  expect(refund.amount).toBe(10000);
  expect(refund.razorpayRefundId).toMatch(/^rfnd_/);
  const res = await rzpWebhook({ event: "refund.processed", refund_id: refund.razorpayRefundId });
  expect(res.status).toBe(200);
  await rzpWebhook({ event: "refund.processed", refund_id: refund.razorpayRefundId }); // replay
  order = await db.order.findUniqueOrThrow({ where: { id: onlineOrderId }, include: { refunds: true, payments: true } });
  expect(order.paymentStatus).toBe("PARTIALLY_REFUNDED");
  expect(order.payments[0].refundedAmount).toBe(10000); // counted exactly once
  expect(await db.notification.count({ where: { userId: order.userId, event: "REFUND_COMPLETED" } })).toBe(1);
  expect(await db.auditLog.count({ where: { entityId: onlineOrderId, action: "refund.initiate" } })).toBe(1);
  await admin.close();
});

test("customer cancels a prepaid order → stock released and automatic Razorpay refund", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "cancel");
  await stubRazorpay(page, "success");
  const before = await stock("BOT-BTL-001");
  await addToCart(page, PRODUCT_C);
  await ensureAddress(page);
  await placeOrder(page, "ONLINE");
  await page.waitForURL("**/checkout/success/**");
  expect(await stock("BOT-BTL-001")).toBe(before - 1);
  const order = await latestOrder(email);
  await page.goto(`/account/orders/${order.orderNumber}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText("Order cancelled").first()).toBeVisible();
  const after = await latestOrder(email);
  expect(after.status).toBe("CANCELLED");
  expect(after.paymentStatus).toBe("REFUND_PENDING");
  expect(after.refunds[0].amount).toBe(after.total);
  expect(await stock("BOT-BTL-001")).toBe(before);
  await ctx.close();
});

test("unpaid online orders expire and release reserved stock (cron, checks Razorpay first)", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "expire");
  await stubRazorpay(page, "dismiss");
  const before = await stock("BOT-EAR-001");
  await addToCart(page, PRODUCT_A);
  await ensureAddress(page);
  await placeOrder(page, "ONLINE");
  await page.waitForURL("**/account/orders/**");
  expect(await stock("BOT-EAR-001")).toBe(before - 1); // reserved
  const order = await latestOrder(email);
  await db.order.update({ where: { id: order.id }, data: { paymentExpiresAt: new Date(Date.now() - 60000) } });
  const denied = await fetch(`${test.info().project.use.baseURL}/api/cron/expire-orders`);
  expect(denied.status).toBe(401);
  const res = await fetch(`${test.info().project.use.baseURL}/api/cron/expire-orders`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(res.status).toBe(200);
  const after = await latestOrder(email);
  expect(after.status).toBe("CANCELLED");
  expect(after.paymentStatus).toBe("CANCELLED");
  expect(await stock("BOT-EAR-001")).toBe(before);
  await ctx.close();
});

test("overselling is impossible: two shoppers race for the last unit", async ({ browser }) => {
  const product = await db.product.findUniqueOrThrow({ where: { sku: "BOT-DUP-001" }, include: { variants: true } });
  await db.productVariant.update({ where: { id: product.variants[0].id }, data: { stock: 1 } });
  const one = await newCustomer(browser, "race1");
  const two = await newCustomer(browser, "race2");
  for (const c of [one, two]) {
    await addToCart(c.page, product.slug);
    await ensureAddress(c.page);
    await c.page.getByText("💵 Cash on Delivery").click();
  }
  await Promise.all([one.page.getByRole("button", { name: "Place order" }).click(), two.page.getByRole("button", { name: "Place order" }).click()]);
  await Promise.race([one.page.waitForURL("**/checkout/success/**").catch(() => null), two.page.waitForURL("**/checkout/success/**").catch(() => null)]);
  await one.page.waitForTimeout(3000);
  const orders = await db.order.count({ where: { user: { email: { in: [one.email, two.email] } } } });
  expect(orders).toBe(1);
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } })).stock).toBe(0);
  await one.ctx.close();
  await two.ctx.close();
});

// ───────────────────────────── Returns ─────────────────────────────

test("return: request → approve → inspect (resellable back to stock, damaged not) → manual COD refund", async ({ browser }) => {
  const codOrderId = await codOrderIdOf();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, codCustomerEmail, PW);
  const order = await db.order.findUniqueOrThrow({ where: { id: codOrderId }, include: { items: true } });
  const stockBefore = await stock("BOT-KUR-001-M");
  const soldBefore = (await db.productVariant.findUniqueOrThrow({ where: { sku: "BOT-KUR-001-M" } })).soldCount;
  await page.goto(`/account/orders/${order.orderNumber}`);
  await page.getByRole("button", { name: "Return items" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Reason").selectOption("Size or fit issue");
  await dlg.getByRole("button", { name: "Submit return request" }).click();
  await expect(page.getByText("Return requested").first()).toBeVisible();
  expect((await db.order.findUniqueOrThrow({ where: { id: codOrderId } })).status).toBe("RETURN_REQUESTED");
  await ctx.close();

  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await login(ap, ADMIN.email, ADMIN.password, true);
  await ap.goto("/admin/returns");
  const card = ap.locator("div.rounded-2xl").filter({ hasText: order.orderNumber }).first();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(ap.getByText("Return approved").first()).toBeVisible();
  await card.getByRole("button", { name: "Mark received & inspect" }).click();
  await ap.getByRole("dialog").getByRole("button", { name: "Confirm receipt" }).click();
  await expect(ap.getByText("Return received and stock updated").first()).toBeVisible();
  expect(await stock("BOT-KUR-001-M")).toBe(stockBefore + 2); // resellable → back to stock
  expect((await db.productVariant.findUniqueOrThrow({ where: { sku: "BOT-KUR-001-M" } })).soldCount).toBe(soldBefore - 2);
  await card.getByRole("button", { name: "Refund customer" }).click();
  const rd = ap.getByRole("dialog");
  await rd.getByLabel("Bank / UPI reference").fill(`UPI${RUN}`);
  await rd.getByRole("button", { name: "Issue refund" }).click();
  await expect(ap.getByText("Refund initiated").first()).toBeVisible();
  const r = await db.returnRequest.findFirstOrThrow({ where: { orderId: codOrderId } });
  expect(r.status).toBe("REFUNDED");
  const o = await db.order.findUniqueOrThrow({ where: { id: codOrderId } });
  expect(o.status).toBe("RETURNED");
  expect(["REFUNDED", "PARTIALLY_REFUNDED"]).toContain(o.paymentStatus);
  await admin.close();
});

// ───────────────────────────── Admin catalogue ─────────────────────────────

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("admin product CRUD with image upload, price change (audited), payment option, disable and delete", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password, true);
  await page.goto("/admin/products/new");
  const sku = `E2E-${RUN}`.toUpperCase();
  await page.getByLabel("Product name").fill(`E2E Test Tote ${RUN}`);
  await page.getByLabel("SKU").first().fill(sku);
  await page.getByLabel("Description").fill("A sturdy canvas tote bag used by the automated test suite.");
  await page.getByLabel("MRP (₹)").fill("999");
  await page.getByLabel("Selling price (₹)").fill("599");
  await page.getByLabel("Product / source cost (₹)").fill("250");
  await page.getByLabel("Shipping cost per unit (₹)").fill("60");
  await page.getByLabel("Stock", { exact: true }).fill("15");
  await page.getByLabel("Payment options").selectOption("ONLINE_ONLY");
  await page.locator('input[type="file"][multiple]').setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: PNG_1PX },
    { name: "two.png", mimeType: "image/png", buffer: PNG_1PX },
  ]);
  await expect(page.getByText("PRIMARY")).toBeVisible();
  await expect(page.locator("img[src^='/uploads/products/']")).toHaveCount(2);
  await expect(page.getByText("If paid online")).toBeVisible();
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForURL(/\/admin\/products\/(?!new)[a-z0-9]+$/);
  const product = await db.product.findUniqueOrThrow({ where: { sku }, include: { images: true, variants: true } });
  expect(product.price).toBe(59900);
  expect(product.paymentOption).toBe("ONLINE_ONLY");
  expect(product.images).toHaveLength(2);
  expect(product.images.every((i) => !i.url.startsWith("data:"))).toBe(true);
  expect(product.variants[0].stock).toBe(15);

  await page.getByLabel("Selling price (₹)").fill("549");
  await page.getByLabel("Payment options").selectOption("ONLINE_AND_COD");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => (await db.product.findUniqueOrThrow({ where: { sku } })).price).toBe(54900);
  const updated = await db.product.findUniqueOrThrow({ where: { sku } });
  expect(updated.price).toBe(54900);
  expect(updated.paymentOption).toBe("ONLINE_AND_COD");
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: product.id, action: "product.price_change" } });
  expect(log.oldValue).toMatchObject({ price: 59900 });
  expect(log.newValue).toMatchObject({ price: 54900 });

  await page.goto(`/products/${product.slug}`);
  await expect(page.getByRole("heading", { name: `E2E Test Tote ${RUN}` })).toBeVisible();

  await page.goto(`/admin/products?q=${sku}`);
  await page.getByRole("button", { name: "Product actions" }).click();
  await page.getByRole("menuitem", { name: "Disable" }).click();
  await expect(page.getByText("Product disabled").first()).toBeVisible();
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe("DISABLED");
  const hidden = await page.request.get(`/products/${product.slug}`);
  expect(hidden.status()).toBe(404);
  await page.getByRole("button", { name: "Delete product" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Product deleted").first()).toBeVisible();
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).deletedAt).not.toBeNull();
  expect(await db.auditLog.count({ where: { entityId: product.id, action: "product.delete" } })).toBe(1);
});

test("admin dashboard, Customer 360, inventory, coupons and settings render with live data", async ({ page }) => {
  const onlineOrderId = await onlineOrderIdOf();
  await login(page, ADMIN.email, ADMIN.password, true);
  await expect(page.getByText("Revenue today")).toBeVisible();
  await expect(page.getByText("Est. profit (month)")).toBeVisible();
  await expect(page.getByText("Revenue — last 30 days")).toBeVisible();
  const cust = await db.user.findUniqueOrThrow({ where: { email: onlineEmail } });
  await page.goto(`/admin/customers/${cust.id}`);
  for (const t of ["Lifetime value", "Avg order value", "Order history", "Payment history", "Addresses", "Shopping behaviour", "Support history", "Communication"]) {
    await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText("passwordHash");
  await page.goto(`/admin/orders/${onlineOrderId}`);
  await expect(page.getByText("Est. net profit")).toBeVisible();
  await expect(page.getByText("Razorpay fee").first()).toBeVisible();
  await page.goto("/admin/inventory?filter=low");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.goto("/admin/coupons");
  await expect(page.getByText("WELCOME10")).toBeVisible();
  await page.goto("/admin/settings");
  await expect(page.getByText("Integrations status")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(process.env.RAZORPAY_KEY_SECRET ?? "e2e_key_secret");
  await page.goto("/admin/audit");
  await expect(page.getByText("product.price_change").first()).toBeVisible();
});

test("coupon applies at checkout and usage is counted", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "coupon");
  await addToCart(page, PRODUCT_C, undefined, 2); // ₹1,098 ≥ ₹499 minimum
  await ensureAddress(page);
  await page.getByLabel("Coupon code").fill("WELCOME10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("WELCOME10 applied")).toBeVisible();
  await placeOrder(page, "COD");
  await page.waitForURL("**/checkout/success/**");
  const order = await latestOrder(email);
  expect(order.couponCode).toBe("WELCOME10");
  expect(order.discount).toBe(Math.min(Math.floor((order.subtotal * 10) / 100), 15000));
  expect(await db.couponUsage.count({ where: { orderId: order.id } })).toBe(1);
  await ctx.close();
});

// ───────────────────────────── Security / RBAC ─────────────────────────────

test("customers can never reach the admin portal or admin APIs", async ({ browser }) => {
  const { ctx, page } = await newCustomer(browser, "rbac");
  await page.goto("/admin/dashboard");
  await page.waitForURL("**/admin/login?denied=1");
  await expect(page.getByText("This area is for store staff only")).toBeVisible();
  expect((await page.request.get("/api/admin/notifications")).status()).toBe(403);
  expect((await page.request.post("/api/admin/uploads/sign", { data: { folder: "products" } })).status()).toBe(403);
  // Customer credentials cannot log into the admin portal.
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("customer@buyontime.test");
  await page.getByLabel("Password", { exact: true }).fill(process.env.SEED_CUSTOMER_PASSWORD ?? "Customer@12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("This login is for store staff only.");
  await ctx.close();
});

test("anonymous users are redirected; cross-site API calls and forged payment data fail safely", async ({ request }) => {
  const r = await request.get("/admin/orders", { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  expect(r.headers()["location"]).toContain("/admin/login");
  const acc = await request.get("/account/orders", { maxRedirects: 0 });
  expect(acc.headers()["location"]).toContain("/login");
  const csrf = await request.post("/api/payments/razorpay/verify", { headers: { Origin: "https://evil.example" }, data: {} });
  expect(csrf.status()).toBe(403);
  const unauth = await request.post("/api/payments/razorpay/verify", { headers: { Origin: test.info().project.use.baseURL! }, data: { razorpay_order_id: "order_x", razorpay_payment_id: "pay_x", razorpay_signature: "0".repeat(64) } });
  expect(unauth.status()).toBe(401);
  const hook = await request.post("/api/webhooks/razorpay", { data: { event: "payment.captured" }, headers: { "X-Razorpay-Signature": "bogus" } });
  expect(hook.status()).toBe(400);
});

test("forged checkout signature never marks an order paid", async ({ browser }) => {
  const { ctx, page, email } = await newCustomer(browser, "forge");
  await stubRazorpay(page, "dismiss");
  await addToCart(page, PRODUCT_A);
  await ensureAddress(page);
  await placeOrder(page, "ONLINE");
  await page.waitForURL("**/account/orders/**");
  const order = await latestOrder(email);
  const res = await page.request.post("/api/payments/razorpay/verify", {
    headers: { Origin: test.info().project.use.baseURL! },
    data: { razorpay_order_id: order.payments[0].razorpayOrderId, razorpay_payment_id: "pay_FORGED12345", razorpay_signature: "a".repeat(64) },
  });
  expect(res.status()).toBe(400);
  const after = await latestOrder(email);
  expect(after.paymentStatus).toBe("PENDING");
  expect(after.status).toBe("PENDING_PAYMENT");
  await ctx.close();
});

test("supplier can manage products and orders but not finance, customers or settings", async ({ page }) => {
  const onlineOrderId = await onlineOrderIdOf();
  await login(page, SUPPLIER.email, SUPPLIER.password, true);
  await expect(page.getByText("New (to pack)")).toBeVisible();
  await expect(page.getByText("Revenue today")).toHaveCount(0);
  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  for (const path of ["/admin/settings", "/admin/customers", "/admin/payments", "/admin/coupons", "/admin/audit"]) {
    await page.goto(path);
    await page.waitForURL("**/admin/forbidden");
  }
  await page.goto(`/admin/orders/${onlineOrderId}`);
  await expect(page.getByText("Customer 360 →")).toHaveCount(0);
  await expect(page.getByText("Est. net profit")).toHaveCount(0);
});

// ───────────────────────────── Responsive ─────────────────────────────

test("responsive layouts: mobile, tablet and desktop (screenshots saved)", async ({ browser }) => {
  const onlineOrderId = await onlineOrderIdOf();
  const shots: [string, string, boolean][] = [
    ["home", "/", false], ["listing", "/products", false], ["product", `/products/${PRODUCT_B}`, false], ["cart", "/cart", true],
    ["checkout", "/checkout", true], ["order", "__ORDER__", true], ["account", "/account", true],
  ];
  const adminShots: [string, string][] = [["admin-dashboard", "/admin/dashboard"], ["admin-order", `/admin/orders/${onlineOrderId}`], ["admin-product", "/admin/products/new"], ["admin-customer", "__CUST__"]];
  const cust = await db.user.findUniqueOrThrow({ where: { email: onlineEmail } });
  const order = await db.order.findUniqueOrThrow({ where: { id: onlineOrderId } });
  for (const [vw, vh, name] of [[390, 844, "mobile"], [820, 1180, "tablet"], [1440, 900, "desktop"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: name === "mobile", hasTouch: name !== "desktop" });
    const page = await ctx.newPage();
    await login(page, onlineEmail, PW);
    await addToCart(page, PRODUCT_C);
    for (const [label, path, auth] of shots) {
      void auth;
      await page.goto(path === "__ORDER__" ? `/account/orders/${order.orderNumber}` : path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${label} @${name} has horizontal overflow`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `screenshots/${name}-${label}.png`, fullPage: false });
    }
    const admin = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: name === "mobile", hasTouch: name !== "desktop" });
    const ap = await admin.newPage();
    await login(ap, ADMIN.email, ADMIN.password, true);
    for (const [label, path] of adminShots) {
      await ap.goto(path === "__CUST__" ? `/admin/customers/${cust.id}` : path);
      await ap.waitForLoadState("networkidle");
      const overflow = await ap.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${label} @${name} has horizontal overflow`).toBeLessThanOrEqual(1);
      await ap.screenshot({ path: `screenshots/${name}-${label}.png` });
    }
    await ctx.close();
    await admin.close();
  }
});

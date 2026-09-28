// Live smoke test against a deployed store. Leaves one cancelled COD order and one test customer behind.
//   BASE=https://… ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/smoke-live.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE.replace(/\/$/, "");
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const browser = await chromium.launch();
try {
  // 1. Public pages + health
  for (const path of ["/", "/products", "/products/insulated-steel-water-bottle-1l", "/api/health", "/sitemap.xml", "/robots.txt"]) {
    const r = await fetch(BASE + path);
    const body = await r.text();
    check(`GET ${path}`, r.status === 200, `status ${r.status}${path === "/api/health" ? " " + body.slice(0, 120) : ""}`);
  }
  const home = await (await fetch(BASE + "/")).text();
  check("notice bar shown", home.includes("Test store"));
  check("no localhost URLs in HTML", !home.includes("localhost"));
  const r404 = await fetch(BASE + "/products/does-not-exist");
  check("unknown product → 404", r404.status === 404, `status ${r404.status}`);
  const adm = await fetch(BASE + "/admin/dashboard", { redirect: "manual" });
  check("admin requires login", [302, 303, 307, 308].includes(adm.status), `status ${adm.status}`);

  // 2. Admin login + image upload to Vercel Blob
  const actx = await browser.newContext({ baseURL: BASE });
  const ap = await actx.newPage();
  await ap.goto("/admin/login");
  await ap.waitForLoadState("networkidle");
  await ap.getByLabel("Email").fill(process.env.ADMIN_EMAIL);
  await ap.getByLabel("Password", { exact: true }).fill(process.env.ADMIN_PASSWORD);
  await ap.getByRole("button", { name: "Sign in" }).click();
  await ap.waitForURL("**/admin/dashboard", { timeout: 30000 });
  check("admin login → dashboard", true);
  const sign = await ap.request.post("/api/admin/uploads/sign", { headers: { Origin: BASE }, data: { folder: "products" } });
  const signJson = await sign.json();
  check("upload driver is Vercel Blob", signJson.driver === "blob", JSON.stringify(signJson).slice(0, 120));
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = await ap.request.post(signJson.uploadUrl, { headers: { Origin: BASE }, multipart: { folder: "products", file: { name: "smoke.png", mimeType: "image/png", buffer: png } } });
  const upJson = await up.json();
  check("image uploaded to storage", up.ok() && /public\.blob\.vercel-storage\.com/.test(upJson.secure_url ?? ""), (upJson.secure_url ?? JSON.stringify(upJson)).slice(0, 110));
  if (upJson.secure_url) {
    const img = await fetch(upJson.secure_url);
    check("uploaded image is served", img.status === 200 && (img.headers.get("content-type") ?? "").startsWith("image/"), `status ${img.status}`);
  }
  for (const p of ["/admin/orders", "/admin/products", "/admin/payments", "/admin/settings", "/admin/customers"]) {
    const res = await ap.goto(p);
    check(`admin page ${p}`, res?.status() === 200, `status ${res?.status()}`);
  }

  // 3. Customer: register → COD order → cancel
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const email = `smoke-${Date.now()}@buyontime.test`;
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Smoke Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill("9876501234");
  await page.getByLabel("Password", { exact: true }).fill("Smoke@Test12345");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/account", { timeout: 30000 });
  check("customer registration (mobile)", true, email);

  await page.goto("/products/insulated-steel-water-bottle-1l");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.getByText("Added to cart").first().waitFor({ timeout: 15000 });
  check("add to cart", true);

  await page.goto("/checkout");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Smoke Test");
  await page.getByLabel("Mobile number").fill("9876501234");
  await page.getByLabel("Flat, house no., building, street").fill("Smoke test address, Sector 45");
  await page.getByLabel("Pincode").fill("122003");
  await page.getByLabel("City").fill("Gurugram");
  await page.getByLabel("State").selectOption("Haryana");
  await page.getByRole("button", { name: "Save and deliver here" }).click();
  await page.getByRole("radio", { name: /Smoke test address/ }).waitFor({ timeout: 15000 });
  await page.waitForLoadState("networkidle");
  const methods = await page.locator("main").innerText();
  check("checkout offers COD", methods.includes("Cash on Delivery"));
  check("checkout shows online payment state", methods.includes("Pay Online") || /online payment/i.test(methods), methods.includes("Pay Online") ? "Pay Online shown" : "online payment unavailable (Razorpay keys not set yet)");
  await page.getByText("💵 Cash on Delivery").click();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL("**/checkout/success/**", { timeout: 30000 });
  const orderNumber = page.url().split("/").pop();
  check("COD order placed", true, orderNumber);

  await page.goto(`/account/orders/${orderNumber}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel order" }).click();
  await page.getByText("Order cancelled").first().waitFor({ timeout: 15000 });
  check("customer cancelled the test order", true);

  // Admin sees it
  const res = await ap.goto(`/admin/orders?q=${orderNumber}`);
  check("admin sees the order", res?.status() === 200 && (await ap.getByRole("link", { name: orderNumber }).count()) > 0);
  const cron = await fetch(BASE + "/api/cron/expire-orders");
  check("cron endpoint rejects unauthenticated calls", cron.status === 401 || cron.status === 403, `status ${cron.status}`);
} catch (err) {
  check("unexpected error", false, String(err?.message ?? err).slice(0, 400));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

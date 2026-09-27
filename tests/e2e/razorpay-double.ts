/**
 * Razorpay TEST DOUBLE — used only by the automated E2E suite (never by the app in production).
 * It implements the subset of the Razorpay REST API the app calls (orders, payments, capture, refunds)
 * and signs checkout responses + webhooks with HMAC-SHA256 exactly like Razorpay, so the app's real
 * verification code is exercised end-to-end without live credentials.
 *
 *   RZP_KEY_ID=… RZP_KEY_SECRET=… RZP_WEBHOOK_SECRET=… APP_URL=http://localhost:3000 npx tsx tests/e2e/razorpay-double.ts
 */
import { createHmac, randomBytes } from "crypto";
import http from "http";

const PORT = Number(process.env.RZP_DOUBLE_PORT ?? 4010);
const KEY_ID = process.env.RZP_KEY_ID ?? "rzp_test_E2EDOUBLE";
const KEY_SECRET = process.env.RZP_KEY_SECRET ?? "e2e_key_secret";
const WEBHOOK_SECRET = process.env.RZP_WEBHOOK_SECRET ?? "e2e_webhook_secret";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

type Order = { id: string; entity: "order"; amount: number; currency: string; receipt: string; status: string; notes: Record<string, string>; created_at: number };
type Payment = Record<string, unknown> & { id: string; order_id: string; amount: number; status: string; amount_refunded: number };
type Refund = { id: string; entity: "refund"; payment_id: string; amount: number; status: string; notes: Record<string, string> };

const orders = new Map<string, Order>();
const payments = new Map<string, Payment>();
const refunds = new Map<string, Refund>();
const id = (p: string) => `${p}_${randomBytes(7).toString("hex").slice(0, 14)}`;
const now = () => Math.floor(Date.now() / 1000);

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(body));
}

async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function authorised(req: http.IncomingMessage) {
  const expected = `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`;
  return req.headers.authorization === expected;
}

async function deliverWebhook(event: string, payload: Record<string, unknown>, eventId?: string, signatureOverride?: string) {
  const bodyStr = JSON.stringify({ entity: "event", account_id: "acc_E2E", event, contains: Object.keys(payload), payload, created_at: now() });
  const signature = signatureOverride ?? createHmac("sha256", WEBHOOK_SECRET).update(bodyStr).digest("hex");
  const r = await fetch(`${APP_URL}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature, "X-Razorpay-Event-Id": eventId ?? id("evt") },
    body: bodyStr,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204, {});
  try {
    // ── Razorpay REST API (Basic auth required, like the real API) ──
    if (path.startsWith("/v1/")) {
      if (!authorised(req)) return send(res, 401, { error: { code: "BAD_REQUEST_ERROR", description: "The api key provided is invalid" } });
      if (req.method === "POST" && path === "/v1/orders") {
        const b = await body(req);
        if (!Number.isInteger(b.amount) || (b.amount as number) < 100) return send(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "Order amount less than minimum amount allowed" } });
        const o: Order = { id: id("order"), entity: "order", amount: b.amount as number, currency: String(b.currency ?? "INR"), receipt: String(b.receipt ?? ""), status: "created", notes: (b.notes as Record<string, string>) ?? {}, created_at: now() };
        orders.set(o.id, o);
        return send(res, 200, o);
      }
      let m = path.match(/^\/v1\/payments\/([^/]+)$/);
      if (req.method === "GET" && m) {
        const p = payments.get(m[1]);
        return p ? send(res, 200, p) : send(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } });
      }
      m = path.match(/^\/v1\/orders\/([^/]+)\/payments$/);
      if (req.method === "GET" && m) {
        return send(res, 200, { entity: "collection", items: [...payments.values()].filter((p) => p.order_id === m![1]) });
      }
      m = path.match(/^\/v1\/payments\/([^/]+)\/capture$/);
      if (req.method === "POST" && m) {
        const p = payments.get(m[1]);
        if (!p) return send(res, 400, { error: { description: "not found" } });
        p.status = "captured";
        p.captured = true;
        return send(res, 200, p);
      }
      m = path.match(/^\/v1\/payments\/([^/]+)\/refund$/);
      if (req.method === "POST" && m) {
        const p = payments.get(m[1]);
        const b = await body(req);
        if (!p || p.status !== "captured") return send(res, 400, { error: { description: "Payment not captured" } });
        const amount = (b.amount as number) ?? p.amount - p.amount_refunded;
        if (amount + p.amount_refunded > p.amount) return send(res, 400, { error: { description: "The refund amount provided is greater than amount captured" } });
        const r: Refund = { id: id("rfnd"), entity: "refund", payment_id: p.id, amount, status: "pending", notes: (b.notes as Record<string, string>) ?? {} };
        refunds.set(r.id, r);
        return send(res, 200, r);
      }
      return send(res, 404, { error: { description: "not implemented in test double" } });
    }

    // ── Test controls (what a customer / Razorpay would do) ──
    if (req.method === "POST" && path === "/test/pay") {
      const b = await body(req);
      const o = orders.get(String(b.order_id));
      if (!o) return send(res, 400, { error: { description: "Unknown order_id" } });
      if (b.amount !== undefined && b.amount !== o.amount) return send(res, 400, { error: { description: `Amount mismatch: checkout ${String(b.amount)} vs order ${o.amount}` } });
      const pid = id("pay");
      const ok = b.outcome !== "fail";
      const fee = Math.round(o.amount * 0.02);
      const tax = Math.round(fee * 0.18);
      const p: Payment = {
        id: pid, entity: "payment", order_id: o.id, amount: o.amount, currency: "INR", method: "upi",
        status: ok ? (b.captureMode === "manual" ? "authorized" : "captured") : "failed", captured: ok && b.captureMode !== "manual",
        fee: ok ? fee + tax : null, tax: ok ? tax : null, amount_refunded: 0, refund_status: null,
        error_code: ok ? null : "BAD_REQUEST_ERROR", error_description: ok ? null : "Payment declined by bank (test)",
        email: "e2e@example.com", contact: "+919876543210", notes: o.notes, created_at: now(),
      };
      payments.set(pid, p);
      if (ok) {
        o.status = "paid";
        const signature = createHmac("sha256", KEY_SECRET).update(`${o.id}|${pid}`).digest("hex");
        return send(res, 200, { razorpay_order_id: o.id, razorpay_payment_id: pid, razorpay_signature: signature });
      }
      return send(res, 200, { error: { code: "BAD_REQUEST_ERROR", description: p.error_description, metadata: { order_id: o.id, payment_id: pid } } });
    }
    if (req.method === "POST" && path === "/test/webhook") {
      const b = await body(req);
      const event = String(b.event);
      let payload: Record<string, unknown> = {};
      if (event.startsWith("payment.") || event === "order.paid") {
        const p = payments.get(String(b.payment_id));
        if (!p) return send(res, 400, { error: "unknown payment" });
        payload = { payment: { entity: p }, ...(event === "order.paid" ? { order: { entity: orders.get(p.order_id) } } : {}) };
      } else if (event.startsWith("refund.")) {
        const r = refunds.get(String(b.refund_id));
        if (!r) return send(res, 400, { error: "unknown refund" });
        if (event === "refund.processed") {
          r.status = "processed";
          const p = payments.get(r.payment_id)!;
          p.amount_refunded += r.amount;
          p.refund_status = p.amount_refunded >= p.amount ? "full" : "partial";
          if (p.amount_refunded >= p.amount) p.status = "refunded";
        }
        if (event === "refund.failed") r.status = "failed";
        payload = { refund: { entity: r }, payment: { entity: payments.get(r.payment_id) } };
      }
      const result = await deliverWebhook(event, payload, b.eventId ? String(b.eventId) : undefined, b.badSignature ? "0".repeat(64) : undefined);
      return send(res, 200, result);
    }
    if (req.method === "GET" && path === "/test/state") {
      return send(res, 200, { orders: [...orders.values()], payments: [...payments.values()], refunds: [...refunds.values()] });
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: String(err) });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`Razorpay test double listening on :${PORT}`));

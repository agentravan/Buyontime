import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { razorpayConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Minimal, dependency-free Razorpay REST client (https://razorpay.com/docs/api/).
 * The key secret is only ever read here on the server.
 */

export type RzpOrder = { id: string; amount: number; currency: string; receipt: string | null; status: string };

export type RzpPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  captured?: boolean;
  fee?: number | null;
  tax?: number | null;
  amount_refunded?: number;
  refund_status?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  email?: string;
  contact?: string;
  notes?: Record<string, string>;
  created_at?: number;
};

export type RzpRefund = { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed"; notes?: Record<string, string> };

export class RazorpayError extends AppError {
  constructor(message: string, public gatewayCode?: string, status = 502) {
    super(message, "PAYMENT_GATEWAY", status);
  }
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeCompareHex(expected: string, received: string): boolean {
  if (!received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, secret = razorpayConfig().keySecret): boolean {
  if (!secret) return false;
  return safeCompareHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string, secret = razorpayConfig().webhookSecret): boolean {
  if (!secret) return false;
  return safeCompareHex(hmacHex(secret, rawBody), signature);
}

async function rzp<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const cfg = razorpayConfig();
  if (!cfg.configured) throw new RazorpayError("Online payments are not configured.", "NOT_CONFIGURED", 503);
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${cfg.apiBase}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[razorpay] network error", path, err);
    throw new RazorpayError("Could not reach the payment gateway. Please try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; description?: string } } | null)?.error;
    console.error("[razorpay] api error", res.status, path, e?.code, e?.description);
    throw new RazorpayError(e?.description || "The payment gateway rejected the request.", e?.code, res.status >= 500 ? 502 : 400);
  }
  return data as T;
}

export const razorpay = {
  createOrder(input: { amount: number; receipt: string; notes?: Record<string, string> }) {
    if (!Number.isInteger(input.amount) || input.amount < 100) {
      throw new AppError("Online payment requires an amount of at least ₹1.");
    }
    return rzp<RzpOrder>("POST", "/orders", { amount: input.amount, currency: "INR", receipt: input.receipt.slice(0, 40), notes: input.notes });
  },
  fetchPayment(paymentId: string) {
    return rzp<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
  },
  fetchOrderPayments(orderId: string) {
    return rzp<{ items: RzpPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
  },
  capturePayment(paymentId: string, amount: number) {
    return rzp<RzpPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency: "INR" });
  },
  createRefund(paymentId: string, input: { amount: number; notes?: Record<string, string> }) {
    return rzp<RzpRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: input.amount, speed: "normal", notes: input.notes });
  },
  fetchRefund(paymentId: string, refundId: string) {
    return rzp<RzpRefund>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`);
  },
};

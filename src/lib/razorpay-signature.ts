import { createHmac, timingSafeEqual } from "crypto";

/** Pure signature helpers (no framework imports) so they can be unit-tested directly. */
export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeCompareHex(expected: string, received: string): boolean {
  if (!received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  if (!secret) return false;
  return safeCompareHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function webhookSignatureValid(rawBody: string, signature: string, secret: string): boolean {
  if (!secret) return false;
  return safeCompareHex(hmacHex(secret, rawBody), signature);
}

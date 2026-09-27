import { NextResponse } from "next/server";
import { handleRazorpayWebhook } from "@/server/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook endpoint. Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL: https://<your-domain>/api/webhooks/razorpay
 *   Secret: RAZORPAY_WEBHOOK_SECRET
 *   Events: payment.authorized, payment.captured, payment.failed, order.paid, refund.created, refund.processed, refund.failed
 * The raw body is verified with HMAC-SHA256; each event id is processed at most once.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const result = await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
  return NextResponse.json(result.body, { status: result.status });
}

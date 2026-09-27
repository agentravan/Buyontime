import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { forbidden, jsonError, sameOrigin } from "@/lib/http";
import { verifyCheckoutPayment } from "@/server/payments";

const schema = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(256),
});

/** Server-side verification of the Razorpay Checkout response (signature + gateway re-fetch). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const result = await verifyCheckoutPayment(user, input);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err);
  }
}

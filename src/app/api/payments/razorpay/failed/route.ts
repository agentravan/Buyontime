import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { forbidden, jsonError, sameOrigin } from "@/lib/http";
import { recordClientPaymentFailure } from "@/server/payments";

const schema = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().max(64).optional(),
  description: z.string().max(300).optional(),
});

/** Records a failure reported by Razorpay Checkout. This can only mark a payment FAILED, never PAID. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const result = await recordClientPaymentFailure(user, input);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { forbidden, jsonError, sameOrigin } from "@/lib/http";
import { verifyMembershipPurchase } from "@/server/membership";

const schema = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(256),
});

/** Verifies the Razorpay Checkout response for a membership (signature + gateway re-fetch). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const result = await verifyMembershipPurchase(user, input);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err);
  }
}

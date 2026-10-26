import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { forbidden, jsonError, sameOrigin } from "@/lib/http";
import { startMembershipPurchase } from "@/server/membership";

const schema = z.object({ plan: z.enum(["HALF_YEAR", "YEAR"]) });

/** Starts a BuyOnTime Plus purchase: creates the Razorpay order the browser pays. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const user = await requireUser();
    const { plan } = schema.parse(await req.json());
    const params = await startMembershipPurchase(user, plan);
    return NextResponse.json({ ok: true, ...params });
  } catch (err) {
    return jsonError(err);
  }
}

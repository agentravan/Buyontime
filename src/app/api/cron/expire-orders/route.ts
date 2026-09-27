import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { expireStaleOrders } from "@/server/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Releases stock held by unpaid online orders after the payment window (checks Razorpay first so a
 * late-captured payment is confirmed, not cancelled). Called by Vercel Cron with `Authorization: Bearer CRON_SECRET`.
 * The same job also runs opportunistically when admins open the dashboard.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const expired = await expireStaleOrders(50);
  return NextResponse.json({ ok: true, expired });
}

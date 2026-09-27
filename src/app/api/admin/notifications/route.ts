import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forbidden } from "@/lib/http";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Lightweight feed polled by the admin portal so staff see new orders/payments without refreshing. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "notifications:view")) return forbidden();
  const [unread, latest] = await Promise.all([
    db.notification.count({ where: { audience: "ADMIN", readAt: null } }),
    db.notification.findMany({ where: { audience: "ADMIN" }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true, event: true } }),
  ]);
  return NextResponse.json({ ok: true, unread, latest }, { headers: { "Cache-Control": "no-store" } });
}

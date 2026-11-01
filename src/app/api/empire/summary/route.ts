import { NextResponse, type NextRequest } from "next/server";
import { empireAuthorised, empireSummary } from "@/server/empire";

export const dynamic = "force-dynamic";

/** GET /api/empire/summary?hours=24 — sales, customers, vouchers and orders awaiting supplier placement. */
export async function GET(req: NextRequest) {
  if (!empireAuthorised(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const hours = Math.min(Math.max(Number(req.nextUrl.searchParams.get("hours")) || 24, 1), 24 * 31);
  try {
    return NextResponse.json(await empireSummary(new Date(Date.now() - hours * 3_600_000)), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[empire/summary]", err);
    return NextResponse.json({ error: "summary unavailable" }, { status: 500 });
  }
}

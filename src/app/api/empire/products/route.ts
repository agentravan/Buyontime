import { NextResponse, type NextRequest } from "next/server";
import { createEmpireDraft, empireAuthorised, empireProductSchema } from "@/server/empire";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/empire/products — price a supplier product for ≥ target profit; creates a DRAFT unless dryRun. */
export async function POST(req: NextRequest) {
  if (!empireAuthorised(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = empireProductSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    return NextResponse.json(await createEmpireDraft(parsed.data));
  } catch (err) {
    console.error("[empire/products]", err);
    const message = err instanceof Error && /Blob|SKU|admin|category/i.test(err.message) ? err.message : "could not create product";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

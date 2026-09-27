import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { forbidden, jsonError, sameOrigin } from "@/lib/http";
import { can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { signUpload } from "@/lib/storage";

/** Returns a short-lived signature for a direct browser → Cloudinary upload (or the local dev endpoint). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const user = await getCurrentUser();
    if (!user || !(can(user.role, "products:manage") || can(user.role, "categories:manage") || can(user.role, "settings:manage"))) return forbidden();
    await rateLimit(`upload-sign:${user.id}`, 120, 3600);
    const body = (await req.json().catch(() => ({}))) as { folder?: string };
    const folder = ["products", "categories", "branding"].includes(body.folder ?? "") ? body.folder! : "products";
    return NextResponse.json({ ok: true, ...signUpload(folder) });
  } catch (err) {
    return jsonError(err);
  }
}

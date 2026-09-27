import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { forbidden, jsonError, sameOrigin } from "@/lib/http";
import { can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { saveLocalUpload } from "@/lib/storage";

export const runtime = "nodejs";

/** Development-only storage driver (disabled in production unless ALLOW_LOCAL_UPLOADS=true). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const user = await getCurrentUser();
    if (!user || !(can(user.role, "products:manage") || can(user.role, "categories:manage") || can(user.role, "settings:manage"))) return forbidden();
    await rateLimit(`upload:${user.id}`, 120, 3600);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("No file uploaded.");
    const saved = await saveLocalUpload(file, String(form.get("folder") ?? "products"));
    return NextResponse.json({ ok: true, secure_url: saved.url, public_id: saved.storageKey.replace(/^local:/, ""), storageKey: saved.storageKey });
  } catch (err) {
    return jsonError(err);
  }
}

import "server-only";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { publicMessage } from "@/lib/errors";

/**
 * CSRF defence for cookie-authenticated JSON endpoints: the request must come from our own origin.
 * (Server Actions get the same check from Next.js automatically.)
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(appUrl()).origin;
  } catch {
    return false;
  }
}

export function jsonError(err: unknown) {
  const { error, code, status } = publicMessage(err);
  return NextResponse.json({ ok: false, error, code }, { status });
}

export function forbidden() {
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route protection: redirects visitors without a session cookie to the right login page.
 * The real authorisation (session validity + role/permission) is enforced server-side in every
 * protected layout, server action and API route.
 */
const SESSION_COOKIE = "bot_session";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/supplier" || pathname.startsWith("/supplier/")) {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !hasSession) {
    const url = new URL("/admin/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if ((pathname.startsWith("/account") || pathname.startsWith("/checkout")) && !hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/checkout/:path*", "/supplier/:path*", "/supplier"],
};

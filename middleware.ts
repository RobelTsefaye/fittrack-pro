import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Use NextAuth `auth()` so session cookies work, including chunked JWTs
 * (`authjs.session-token.0`, …). A plain cookie name check misses those and
 * causes a login → dashboard → login loop.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const isPublic =
    pathname === "/" || pathname === "/login" || pathname === "/register";

  if (isPublic) {
    if (req.auth?.user && (pathname === "/login" || pathname === "/register")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons).*)"],
};

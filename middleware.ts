import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/.well-known/")) {
    return NextResponse.next();
  }

  const isPublic =
    pathname === "/" || pathname === "/login" || pathname === "/register";

  if (isPublic) {
    // Authenticated users on landing/login/register go straight to the app.
    // This means the home-screen icon (start_url=/dashboard) and any direct
    // visit to "/" both land on the dashboard for logged-in users.
    if (req.auth?.user) {
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

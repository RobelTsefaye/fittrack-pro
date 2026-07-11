import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getDashboardClientPayload } from "@/features/dashboard/queries";

/**
 * The main Dashboard page's bundled payload (project-docs/offline-first-
 * roadmap.md Phase 2) — `getDashboardClientPayload` already builds exactly
 * this shape server-side (with its own `unstable_cache`, a server-only API
 * that can't run in a client component), plus the settings lookup the page
 * used to do alongside it. No existing route returned this combination.
 */
export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, user, payload] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    // The Dashboard greeting used `useSession()` (NextAuth's cookie-based
    // session), which native deliberately doesn't rely on as its login
    // credential (Bearer token instead, see Phase 2) — so `session.user.name`
    // never resolves there, online or offline. Fetched here alongside the
    // rest of this Bearer-token-authenticated payload instead, and cached
    // with it (also fixes the known "generic greeting offline" gap).
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    getDashboardClientPayload(userId),
  ]);

  return NextResponse.json({
    data: {
      weightUnit: settings?.weightUnit ?? "KG",
      userName: user?.name ?? null,
      payload,
    },
  });
}

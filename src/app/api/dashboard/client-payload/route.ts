import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDashboardClientPayload } from "@/features/dashboard/queries";
import { computeRecovery } from "@/features/health/recovery";
import { requireUserId, withApi } from "@/lib/api/route-handler";

/**
 * The main Dashboard page's bundled payload (project-docs/offline-first-
 * roadmap.md Phase 2) — `getDashboardClientPayload` already builds exactly
 * this shape server-side (with its own `unstable_cache`, a server-only API
 * that can't run in a client component), plus the settings lookup the page
 * used to do alongside it. No existing route returned this combination.
 */
export const GET = withApi(async function GET() {
  const userId = await requireUserId();

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

  // Recovery readiness for the dashboard hint. Best effort: no health data
  // (or any failure) simply means no hint, never a broken dashboard.
  const recovery = await computeRecovery(userId)
    .then((r) =>
      r.baseline.daysOfData >= 3 ? { score: Math.round(r.score), level: r.level } : null
    )
    .catch(() => null);

  return NextResponse.json({
    data: {
      weightUnit: settings?.weightUnit ?? "KG",
      userName: user?.name ?? null,
      payload,
      recovery,
    },
  });
});

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

  const [settings, payload] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    getDashboardClientPayload(userId),
  ]);

  return NextResponse.json({
    data: {
      weightUnit: settings?.weightUnit ?? "KG",
      payload,
    },
  });
}

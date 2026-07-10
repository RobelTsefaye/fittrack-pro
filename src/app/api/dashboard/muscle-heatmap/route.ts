import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getMuscleVolumeLastDays } from "@/services/muscle-heatmap";

/**
 * Backs the Dashboard's MuscleHeatmapCard (project-docs/offline-first-
 * roadmap.md Phase 2) — that component used to be an async Server Component
 * calling `getMuscleVolumeLastDays` + a settings lookup directly; no existing
 * route exposed this data.
 */
export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [data, settings] = await Promise.all([
    getMuscleVolumeLastDays(userId, 7),
    prisma.userSettings.findUnique({ where: { userId }, select: { weightUnit: true } }),
  ]);

  return NextResponse.json({
    data: { entries: data, weightUnit: (settings?.weightUnit ?? "KG").toLowerCase() },
  });
}

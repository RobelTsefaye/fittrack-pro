import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getAllPersonalRecords, getAchievements } from "@/services/personal-records";
import { getDashboardSummary } from "@/features/dashboard/queries";

/**
 * Bundles everything the Records page needs into one call — records/page.tsx
 * (project-docs/offline-first-roadmap.md Phase 2) used to compose this from
 * three separate server-side calls plus a direct settings lookup; no existing
 * route returned all of it together, so this is a genuinely new route rather
 * than a client-side port of an existing one.
 */
export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, records, summary] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    getAllPersonalRecords(userId),
    getDashboardSummary(userId),
  ]);

  const achievements = await getAchievements(userId, summary.workoutStreakDays);

  return NextResponse.json({
    data: {
      records,
      achievements,
      weightUnit: settings?.weightUnit ?? "KG",
      streak: summary.workoutStreakDays,
      totalWorkouts: summary.totalWorkouts,
      totalPRs: summary.personalRecordsCount,
    },
  });
}

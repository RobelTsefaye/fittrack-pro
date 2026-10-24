import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllPersonalRecords, getAchievements } from "@/services/personal-records";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { requireUserId, withApi } from "@/lib/api/route-handler";

/**
 * Bundles everything the Records page needs into one call — records/page.tsx
 * (project-docs/offline-first-roadmap.md Phase 2) used to compose this from
 * three separate server-side calls plus a direct settings lookup; no existing
 * route returned all of it together, so this is a genuinely new route rather
 * than a client-side port of an existing one.
 */
export const GET = withApi(async function GET() {
  const userId = await requireUserId();

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
});

import { NextResponse } from "next/server";
import { getAllPersonalRecords, getAchievements } from "@/services/personal-records";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const [records, summary] = await Promise.all([
    getAllPersonalRecords(userId),
    getDashboardSummary(userId),
  ]);
  const achievements = await getAchievements(userId, summary.workoutStreakDays);

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "personal-records",
      generatedAt: new Date().toISOString(),
      records,
      achievements,
    },
    meta: { endpoint: "personal-records", count: records.length },
  });
});

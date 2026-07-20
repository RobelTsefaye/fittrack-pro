import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getAllPersonalRecords, getAchievements } from "@/services/personal-records";
import { getDashboardSummary } from "@/features/dashboard/queries";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}

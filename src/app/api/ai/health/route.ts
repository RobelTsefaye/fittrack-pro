import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getHealthSnapshots } from "@/features/health/health-data";
import { computeRecovery, computeRecoveryHistory } from "@/features/health/recovery";
import { clampWeeks } from "@/features/ai/schemas";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = clampWeeks(req.nextUrl.searchParams.get("days"), 30, 180);

  const [snapshots, recovery, recoveryHistory] = await Promise.all([
    getHealthSnapshots(userId, days),
    computeRecovery(userId),
    computeRecoveryHistory(userId, days),
  ]);

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "health",
      generatedAt: new Date().toISOString(),
      // Sleep, HR/HRV, respiratory rate, wrist temp, VO2max, activity
      // (steps/exerciseMinutes/standHours), micronutrients — the fields of
      // HealthSnapshot the other /api/ai/* routes don't already surface
      // (those only expose the nutrition-macro subset via NutritionTrend).
      snapshots,
      recovery,
      recoveryHistory,
    },
    meta: { endpoint: "health", days, snapshotCount: snapshots.length },
  });
}

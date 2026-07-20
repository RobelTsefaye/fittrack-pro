import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getWorkoutDetailData } from "@/features/workouts/workout-detail-data";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const workout = await getWorkoutDetailData(userId, id);
  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "workout-detail",
      generatedAt: new Date().toISOString(),
      workout,
    },
    meta: { endpoint: "workouts/:id" },
  });
}

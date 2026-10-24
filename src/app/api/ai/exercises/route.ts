import { NextRequest, NextResponse } from "next/server";
import { getExercises } from "@/features/exercises/exercise-data";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const searchParams = req.nextUrl.searchParams;
  const exercises = await getExercises(userId, {
    muscleGroup: searchParams.get("muscleGroup"),
    equipment: searchParams.get("equipment"),
    search: searchParams.get("search"),
  });

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "exercises",
      generatedAt: new Date().toISOString(),
      exercises,
    },
    meta: { endpoint: "exercises", count: exercises.length },
  });
});

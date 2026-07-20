import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getExercises } from "@/features/exercises/exercise-data";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}

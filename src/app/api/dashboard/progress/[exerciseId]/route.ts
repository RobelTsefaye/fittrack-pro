import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import {
  computeProgressBySession,
  fetchCompletedSetsForExercise,
  findExerciseVisibleToUser,
} from "@/features/exercises/history-core";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { exerciseId } = await params;

  const exercise = await findExerciseVisibleToUser(exerciseId, userId);
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const sets = await fetchCompletedSetsForExercise(userId, exerciseId, 250);
  const progressBySession = computeProgressBySession(sets);

  return NextResponse.json({
    data: {
      exercise: { id: exercise.id, name: exercise.name },
      progressBySession,
    },
  });
}

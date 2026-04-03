import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  computeProgressBySession,
  fetchCompletedSetsForExercise,
  findExerciseVisibleToUser,
} from "@/features/exercises/history-core";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { exerciseId } = await params;

  const exercise = await findExerciseVisibleToUser(exerciseId, session.user.id);
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const sets = await fetchCompletedSetsForExercise(session.user.id, exerciseId, 250);
  const progressBySession = computeProgressBySession(sets);

  return NextResponse.json({
    data: {
      exercise: { id: exercise.id, name: exercise.name },
      progressBySession,
    },
  });
}

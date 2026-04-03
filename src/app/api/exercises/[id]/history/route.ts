import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeProgressBySession,
  computeVolumeBySession,
  fetchCompletedSetsForExercise,
  findExerciseVisibleToUser,
  mapSetsToHistoryRows,
} from "@/features/exercises/history-core";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: exerciseId } = await params;

  const exercise = await findExerciseVisibleToUser(exerciseId, session.user.id);

  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const sets = await fetchCompletedSetsForExercise(session.user.id, exerciseId);

  const history = mapSetsToHistoryRows(sets);
  const progressBySession = computeProgressBySession(sets);
  const volumeBySession = computeVolumeBySession(sets);

  const bestPersonalRecord = await prisma.personalRecord.findFirst({
    where: { userId: session.user.id, exerciseId },
    orderBy: { estimated1RM: "desc" },
  });

  return NextResponse.json({
    data: {
      exercise: {
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
      },
      history,
      progressBySession,
      volumeBySession,
      bestPersonalRecord: bestPersonalRecord
        ? {
            weight: bestPersonalRecord.weight,
            reps: bestPersonalRecord.reps,
            estimated1RM: bestPersonalRecord.estimated1RM,
            achievedAt: bestPersonalRecord.achievedAt.toISOString(),
          }
        : null,
    },
  });
}

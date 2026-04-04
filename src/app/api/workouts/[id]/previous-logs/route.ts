import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PreviousLogEntry = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
} | null;

/**
 * Per exercise: values from the most recently *completed* workout (excluding this one),
 * picking the **last logged working set** in that session (highest `setNumber` — what was
 * moved last), not the heaviest set.
 *
 * Raw SQL + DISTINCT ON so “latest session” ordering is reliable.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workoutId } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId: session.user.id },
    include: {
      workoutExercises: { select: { exerciseId: true } },
    },
  });

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const exerciseIds = [...new Set(workout.workoutExercises.map((we) => we.exerciseId))];
  if (exerciseIds.length === 0) {
    return NextResponse.json({ data: {} as Record<string, PreviousLogEntry> });
  }

  const rows = await prisma.$queryRaw<
    Array<{
      exercise_id: string;
      weight: number | null;
      reps: number | null;
      rpe: number | null;
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON (we."exerciseId")
      we."exerciseId" AS exercise_id,
      s.weight AS weight,
      s.reps AS reps,
      s.rpe AS rpe
    FROM workout_exercises we
    INNER JOIN workouts w ON w.id = we."workoutId"
    INNER JOIN sets s ON s."workoutExerciseId" = we.id
    WHERE w."userId" = ${session.user.id}
      AND w."completedAt" IS NOT NULL
      AND w.id <> ${workoutId}
      AND we."exerciseId" IN (${Prisma.join(exerciseIds)})
      AND s."isWarmup" = false
      AND s.reps > 0
      AND s.weight IS NOT NULL
    ORDER BY
      we."exerciseId",
      w."completedAt" DESC,
      s."setNumber" DESC
  `);

  const data = Object.fromEntries(
    exerciseIds.map((id) => {
      const row = rows.find((r) => r.exercise_id === id);
      if (!row)
        return [
          id,
          null,
        ] as const;
      return [
        id,
        {
          weight: row.weight,
          reps: row.reps,
          rpe: row.rpe,
        },
      ] as const;
    })
  ) as Record<string, PreviousLogEntry>;

  return NextResponse.json({ data });
}

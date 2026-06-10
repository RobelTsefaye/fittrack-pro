import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PreviousSetEntry = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
};

/** Per exercise: ordered array of working sets from the previous session. */
export type PreviousLogEntry = PreviousSetEntry[] | null;

/**
 * For each exercise in the current workout, return **all working sets**
 * (non-warmup, weight + reps filled) from the most recent *other* completed
 * workout that contains that exercise — ordered by setNumber.
 *
 * - "Most recent" = highest `startedAt` (not `completedAt`, because users
 *   sometimes press "finish" days later).
 * - Workouts where the exercise only has empty/warmup sets are skipped via
 *   a nested `sets: { some: … }` filter so we never pick a stale session.
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

  const exerciseIds = [
    ...new Set(workout.workoutExercises.map((we) => we.exerciseId)),
  ];

  if (exerciseIds.length === 0) {
    return NextResponse.json({ data: {} as Record<string, PreviousLogEntry> });
  }

  const validSetFilter = {
    isWarmup: false,
    reps: { gt: 0 },
    weight: { not: null },
  } as const;

  // One DISTINCT ON query finds the newest qualifying workout-exercise per
  // exercise (instead of two queries per exercise).
  const latestWes = await prisma.$queryRaw<
    Array<{ id: string; exerciseId: string }>
  >`
    SELECT DISTINCT ON (we."exerciseId") we.id, we."exerciseId"
    FROM "workout_exercises" we
    JOIN "workouts" w ON w.id = we."workoutId"
    WHERE w."userId" = ${session.user.id}
      AND w."completedAt" IS NOT NULL
      AND w.id <> ${workoutId}
      AND we."exerciseId" = ANY(${exerciseIds})
      AND EXISTS (
        SELECT 1 FROM "sets" s
        WHERE s."workoutExerciseId" = we.id
          AND s."isWarmup" = false
          AND s.reps > 0
          AND s.weight IS NOT NULL
      )
    ORDER BY we."exerciseId", w."startedAt" DESC
  `;

  const exerciseByWeId = new Map(latestWes.map((we) => [we.id, we.exerciseId]));

  const sets = await prisma.set.findMany({
    where: {
      workoutExerciseId: { in: latestWes.map((we) => we.id) },
      ...validSetFilter,
    },
    orderBy: { setNumber: "asc" },
    select: {
      workoutExerciseId: true,
      setNumber: true,
      weight: true,
      reps: true,
      rpe: true,
    },
  });

  const data: Record<string, PreviousLogEntry> = Object.fromEntries(
    exerciseIds.map((id) => [id, null])
  );
  for (const s of sets) {
    const exerciseId = exerciseByWeId.get(s.workoutExerciseId);
    if (!exerciseId) continue;
    const entry = { setNumber: s.setNumber, weight: s.weight, reps: s.reps, rpe: s.rpe };
    const existing = data[exerciseId];
    if (existing) existing.push(entry);
    else data[exerciseId] = [entry];
  }

  return NextResponse.json({ data });
}

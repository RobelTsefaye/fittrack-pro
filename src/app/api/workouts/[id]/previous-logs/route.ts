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

  const entries = await Promise.all(
    exerciseIds.map(async (exerciseId) => {
      const prevWorkout = await prisma.workout.findFirst({
        where: {
          userId: session.user!.id,
          completedAt: { not: null },
          id: { not: workoutId },
          workoutExercises: {
            some: {
              exerciseId,
              sets: { some: validSetFilter },
            },
          },
        },
        orderBy: { startedAt: "desc" },
        select: {
          workoutExercises: {
            where: { exerciseId },
            select: { id: true },
            take: 1,
          },
        },
      });

      const weId = prevWorkout?.workoutExercises[0]?.id;
      if (!weId) return [exerciseId, null] as const;

      const sets = await prisma.set.findMany({
        where: { workoutExerciseId: weId, ...validSetFilter },
        orderBy: { setNumber: "asc" },
        select: { setNumber: true, weight: true, reps: true, rpe: true },
      });

      if (sets.length === 0) return [exerciseId, null] as const;

      return [exerciseId, sets] as const;
    })
  );

  const data = Object.fromEntries(entries) as Record<string, PreviousLogEntry>;

  return NextResponse.json({ data });
}

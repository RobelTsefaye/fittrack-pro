import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PreviousLogEntry = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
} | null;

/**
 * Per exercise: weight/reps/rpe from the **last working set** (highest setNumber,
 * excluding warmups) of that exercise in the most recently *started* completed workout.
 *
 * Sorted by `startedAt` (not `completedAt`) because a user may press "finish" days
 * after the actual session, making `completedAt` unreliable for "last training".
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

  const entries = await Promise.all(
    exerciseIds.map(async (exerciseId) => {
      const latestWorkout = await prisma.workout.findFirst({
        where: {
          userId: session.user!.id,
          completedAt: { not: null },
          id: { not: workoutId },
          workoutExercises: { some: { exerciseId } },
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

      const weId = latestWorkout?.workoutExercises[0]?.id;
      if (!weId) return [exerciseId, null] as const;

      const lastSet = await prisma.set.findFirst({
        where: {
          workoutExerciseId: weId,
          isWarmup: false,
          reps: { gt: 0 },
          weight: { not: null },
        },
        orderBy: { setNumber: "desc" },
        select: { weight: true, reps: true, rpe: true },
      });

      if (!lastSet) return [exerciseId, null] as const;

      return [
        exerciseId,
        { weight: lastSet.weight, reps: lastSet.reps, rpe: lastSet.rpe },
      ] as const;
    })
  );

  const data = Object.fromEntries(entries) as Record<string, PreviousLogEntry>;

  return NextResponse.json({ data });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PreviousLogEntry = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
} | null;

/**
 * Last logged working set per exercise before this workout session (for placeholders).
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

  const entries = await Promise.all(
    exerciseIds.map(async (exerciseId) => {
      const lastWe = await prisma.workoutExercise.findFirst({
        where: {
          exerciseId,
          workout: {
            userId: session.user.id,
            completedAt: { not: null },
            id: { not: workoutId },
            startedAt: { lt: workout.startedAt },
          },
        },
        orderBy: { workout: { startedAt: "desc" } },
        include: {
          sets: {
            where: { isWarmup: false, isCompleted: true, reps: { gt: 0 } },
            orderBy: { setNumber: "desc" },
            take: 1,
            select: { weight: true, reps: true, rpe: true },
          },
        },
      });

      const s = lastWe?.sets[0];
      if (!s) return [exerciseId, null] as const;
      return [
        exerciseId,
        {
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
        },
      ] as const;
    })
  );

  const data = Object.fromEntries(entries) as Record<string, PreviousLogEntry>;
  return NextResponse.json({ data });
}

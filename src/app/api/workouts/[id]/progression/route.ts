import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { suggestProgression, type ProgressionSuggestion } from "@/features/workouts/progression";
import type { PreviousSetEntry } from "@/features/workouts/previous-logs-types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workoutId } = await params;
  const [workout, settings] = await Promise.all([
    prisma.workout.findFirst({
      where: { id: workoutId, userId },
      select: { workoutExercises: { select: { exerciseId: true } } },
    }),
    prisma.userSettings.findUnique({ where: { userId }, select: { weightUnit: true } }),
  ]);
  if (!workout) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

  const exerciseIds = [...new Set(workout.workoutExercises.map((we) => we.exerciseId))];
  const data: Record<string, ProgressionSuggestion[]> = Object.fromEntries(
    exerciseIds.map((id) => [id, []])
  );
  if (exerciseIds.length === 0) return NextResponse.json({ data });

  const history = await prisma.workoutExercise.findMany({
    where: {
      exerciseId: { in: exerciseIds },
      workout: { userId, completedAt: { not: null }, id: { not: workoutId } },
      sets: { some: { isWarmup: false, weight: { not: null }, reps: { gt: 0 } } },
    },
    select: {
      exerciseId: true,
      workout: { select: { id: true, startedAt: true } },
      sets: {
        where: { isWarmup: false, weight: { not: null }, reps: { gt: 0 } },
        orderBy: { setNumber: "asc" },
        select: { setNumber: true, weight: true, reps: true, rpe: true },
      },
    },
    orderBy: { workout: { startedAt: "desc" } },
  });

  const sessionsByExercise = new Map<string, PreviousSetEntry[][]>();
  const seenWorkoutByExercise = new Map<string, Set<string>>();
  for (const entry of history) {
    const sessions = sessionsByExercise.get(entry.exerciseId) ?? [];
    const seen = seenWorkoutByExercise.get(entry.exerciseId) ?? new Set<string>();
    if (sessions.length < 1 && !seen.has(entry.workout.id)) {
      sessions.push(entry.sets.map((set) => ({
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
      })));
      sessionsByExercise.set(entry.exerciseId, sessions);
      seen.add(entry.workout.id);
      seenWorkoutByExercise.set(entry.exerciseId, seen);
    }
  }
  for (const exerciseId of exerciseIds) {
    data[exerciseId] = suggestProgression(
      sessionsByExercise.get(exerciseId) ?? [],
      settings?.weightUnit ?? "KG"
    );
  }

  return NextResponse.json({ data });
}

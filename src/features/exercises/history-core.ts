import { prisma } from "@/lib/prisma";
import { epley1RM } from "@/lib/strength";
import type { VolumePoint } from "@/features/exercises/progress-types";

export async function findExerciseVisibleToUser(exerciseId: string, userId: string) {
  return prisma.exercise.findFirst({
    where: {
      id: exerciseId,
      OR: [{ userId: null }, { userId }],
    },
  });
}

export async function fetchCompletedSetsForExercise(
  userId: string,
  exerciseId: string,
  take = 500
) {
  // Any non-warmup set with reps in a *finished* workout counts — users often tap
  // "Finish workout" without ticking every set's checkmark (isCompleted stays false).
  return prisma.set.findMany({
    where: {
      isWarmup: false,
      reps: { gt: 0 },
      workoutExercise: {
        exerciseId,
        workout: {
          userId,
          completedAt: { not: null },
        },
      },
    },
    include: {
      workoutExercise: {
        include: {
          workout: {
            select: {
              id: true,
              name: true,
              completedAt: true,
              startedAt: true,
            },
          },
        },
      },
    },
    orderBy: [
      { workoutExercise: { workout: { completedAt: "desc" } } },
      { setNumber: "desc" },
    ],
    take,
  });
}

export type SetWithWorkout = Awaited<
  ReturnType<typeof fetchCompletedSetsForExercise>
>[number];

export function computeProgressBySession(sets: SetWithWorkout[]) {
  const byWorkout = new Map<
    string,
    { date: string; bestEstimated1RM: number; bestWeight: number; repsAtBest: number }
  >();

  for (const s of sets) {
    const w = s.workoutExercise.workout;
    const ref = w.completedAt ?? w.startedAt;
    const dateKey = ref.toISOString().slice(0, 10);
    const wgt = s.weight ?? 0;
    const e1 = epley1RM(wgt, s.reps!);
    const cur = byWorkout.get(w.id);
    if (!cur || e1 > cur.bestEstimated1RM) {
      byWorkout.set(w.id, {
        date: dateKey,
        bestEstimated1RM: e1,
        bestWeight: wgt,
        repsAtBest: s.reps!,
      });
    }
  }

  return [...byWorkout.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function computeVolumeBySession(sets: SetWithWorkout[]): VolumePoint[] {
  const byWorkout = new Map<string, { date: string; volume: number }>();

  for (const s of sets) {
    const w = s.workoutExercise.workout;
    const ref = w.completedAt ?? w.startedAt;
    const dateKey = ref.toISOString().slice(0, 10);
    const vol = (s.weight ?? 0) * s.reps!;
    const cur = byWorkout.get(w.id);
    if (cur) cur.volume += vol;
    else byWorkout.set(w.id, { date: dateKey, volume: vol });
  }

  return [...byWorkout.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function mapSetsToHistoryRows(sets: SetWithWorkout[]) {
  return sets.map((s) => {
    const w = s.workoutExercise.workout;
    const at = s.completedAt ?? w.completedAt ?? w.startedAt;
    const wgt = s.weight ?? 0;
    return {
      setId: s.id,
      workoutId: w.id,
      workoutName: w.name,
      weight: wgt,
      reps: s.reps!,
      rpe: s.rpe,
      estimated1RM: epley1RM(wgt, s.reps!),
      completedAt: at.toISOString(),
    };
  });
}

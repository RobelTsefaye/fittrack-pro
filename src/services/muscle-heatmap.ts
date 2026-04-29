import { prisma } from "@/lib/prisma";
import type { MuscleGroup } from "@/generated/prisma/client";

export type MuscleHeatEntry = {
  muscleGroup: MuscleGroup;
  volume: number;   // total weight × reps for the window
  intensity: number; // 0–1 normalised
};

/**
 * Returns per-muscle-group volume for completed workouts
 * within the last `days` days (default 7).
 */
export async function getMuscleVolumeLastDays(
  userId: string,
  days = 7
): Promise<MuscleHeatEntry[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const workoutExercises = await prisma.workoutExercise.findMany({
    where: {
      workout: {
        userId,
        completedAt: { gte: since, not: null },
      },
    },
    include: {
      exercise: { select: { muscleGroup: true } },
      sets: {
        where: {
          isCompleted: true,
          weight: { not: null },
          reps:   { not: null },
        },
        select: { weight: true, reps: true },
      },
    },
  });

  const volumeMap = new Map<MuscleGroup, number>();

  for (const we of workoutExercises) {
    const mg  = we.exercise.muscleGroup;
    const vol = we.sets.reduce(
      (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
      0
    );
    if (vol > 0) {
      volumeMap.set(mg, (volumeMap.get(mg) ?? 0) + vol);
    }
  }

  if (volumeMap.size === 0) return [];

  const maxVol = Math.max(...volumeMap.values());

  return Array.from(volumeMap.entries()).map(([muscleGroup, volume]) => ({
    muscleGroup,
    volume,
    intensity: maxVol > 0 ? volume / maxVol : 0,
  }));
}

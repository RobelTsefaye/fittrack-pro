import { prisma } from "@/lib/prisma";
import { DEFAULT_REST_TIMER } from "@/lib/constants";
import type { WorkoutData } from "./workout-types";

/**
 * Server-side fetch of a workout in the `GET /api/workouts/:id` shape, so the
 * page can render with data immediately instead of waiting for the client
 * fetch waterfall. Dates are serialized to ISO strings to match WorkoutData.
 */
export async function getWorkoutDetailData(
  userId: string,
  workoutId: string
): Promise<WorkoutData | null> {
  const [workout, settings] = await Promise.all([
    prisma.workout.findFirst({
      where: { id: workoutId, userId },
      include: {
        workoutExercises: {
          include: {
            exercise: { select: { id: true, name: true, muscleGroup: true, equipment: true } },
            sets: { orderBy: { setNumber: "asc" } },
          },
          orderBy: { order: "asc" },
        },
      },
    }),
    // See GET /api/workouts/:id — the Watch (JS sync + native no-phone-open
    // proxy) has no access to user settings otherwise, so this rides along
    // on the same response instead of a separate fetch.
    prisma.userSettings.findUnique({ where: { userId }, select: { restTimerDefault: true } }),
  ]);

  if (!workout) return null;
  const restTimerDefaultSeconds = settings?.restTimerDefault ?? DEFAULT_REST_TIMER;

  return {
    id: workout.id,
    name: workout.name,
    notes: workout.notes,
    startedAt: workout.startedAt.toISOString(),
    completedAt: workout.completedAt?.toISOString() ?? null,
    durationSeconds: workout.durationSeconds,
    planSessionId: workout.planSessionId,
    restTimerDefaultSeconds,
    restTimerAdjustSeconds: workout.restTimerAdjustSeconds,
    workoutExercises: workout.workoutExercises.map((we) => ({
      id: we.id,
      exerciseId: we.exerciseId,
      order: we.order,
      supersetGroup: we.supersetGroup,
      notes: we.notes,
      isCompleted: we.isCompleted,
      exercise: we.exercise,
      sets: we.sets.map((s) => ({
        id: s.id,
        setNumber: s.setNumber,
        reps: s.reps,
        weight: s.weight,
        rpe: s.rpe,
        isWarmup: s.isWarmup,
        isCompleted: s.isCompleted,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    })),
  };
}

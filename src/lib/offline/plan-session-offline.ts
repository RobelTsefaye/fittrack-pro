import type { WorkoutData } from "@/features/workouts/workout-types";
import { saveWorkoutSnapshot, enqueueWorkoutOp } from "./workout-offline-store";

export type OfflinePlanSessionExercise = {
  exerciseId: string;
  targetSets: number;
  exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    equipment: string;
  };
};

export type OfflinePlanSession = {
  id: string;
  name: string;
  exercises: OfflinePlanSessionExercise[];
};

/**
 * Client-side equivalent of POST /api/plan-sessions/[sessionId]/start —
 * builds the same Workout/WorkoutExercise/Set structure the server would,
 * entirely from data already cached locally (see plan-detail-cache), and
 * queues it exactly like a manually-built offline workout would (reusing
 * post_workout/post_exercise/post_set — no new queue-op types or server
 * changes needed). Returns the client-generated workout id, which the
 * caller navigates to /workouts/new to pick up (see that page's "resume
 * active offline workout" mount effect).
 */
export async function startPlanSessionOffline(session: OfflinePlanSession): Promise<string> {
  const workoutId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const workoutExercises = session.exercises.map((pse) => {
    const clientWeId = crypto.randomUUID();
    const sets = Array.from({ length: pse.targetSets }, (_, i) => ({
      id: crypto.randomUUID(),
      setNumber: i + 1,
      reps: null,
      weight: null,
      rpe: null,
      isWarmup: false,
      isCompleted: false,
      completedAt: null,
    }));
    return { clientWeId, pse, sets };
  });

  const data: WorkoutData = {
    id: workoutId,
    name: session.name,
    notes: null,
    startedAt,
    completedAt: null,
    durationSeconds: null,
    planSessionId: session.id,
    workoutExercises: workoutExercises.map(({ clientWeId, pse, sets }, order) => ({
      id: clientWeId,
      exerciseId: pse.exerciseId,
      order,
      notes: null,
      isCompleted: false,
      exercise: pse.exercise,
      sets,
    })),
  };

  await saveWorkoutSnapshot(workoutId, data, true);
  await enqueueWorkoutOp(workoutId, { t: "post_workout", name: session.name });
  for (const { clientWeId, pse, sets } of workoutExercises) {
    await enqueueWorkoutOp(workoutId, { t: "post_exercise", exerciseId: pse.exerciseId, clientWeId });
    for (const set of sets) {
      await enqueueWorkoutOp(workoutId, { t: "post_set", clientWeId, clientSetId: set.id });
    }
  }

  return workoutId;
}

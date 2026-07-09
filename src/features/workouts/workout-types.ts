/** Shape of `GET /api/workouts/:id` — UI + offline snapshots. */

export type WorkoutSetData = {
  id: string;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  isWarmup: boolean;
  isCompleted: boolean;
  completedAt: string | null;
};

export type WorkoutExerciseData = {
  id: string;
  exerciseId: string;
  order: number;
  notes: string | null;
  isCompleted: boolean;
  exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    equipment: string;
  };
  sets: WorkoutSetData[];
};

export type WorkoutData = {
  id: string;
  name: string | null;
  notes: string | null;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  planSessionId: string | null;
  workoutExercises: WorkoutExerciseData[];
  /** User's configured rest-timer duration (Settings), only present on the
   *  GET /api/workouts/:id response — optional so local/offline-constructed
   *  WorkoutData objects elsewhere don't all need updating. Consumers should
   *  fall back to DEFAULT_REST_TIMER when absent. */
  restTimerDefaultSeconds?: number;
  /** Cumulative +/-15s nudge for the current rest period (see
   *  POST /api/workouts/:id/rest-timer-adjust) — added on top of
   *  restTimerDefaultSeconds by every surface that independently computes
   *  its own countdown, so a nudge from any one of them lands on the others. */
  restTimerAdjustSeconds?: number;
};

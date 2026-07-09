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
};

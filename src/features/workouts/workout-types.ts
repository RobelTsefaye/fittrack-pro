/** Shape of `GET /api/workouts/:id` — shared for UI + offline snapshots. */

export type WorkoutSetData = {
  id: string;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  isWarmup: boolean;
  isCompleted: boolean;
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
};

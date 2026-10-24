import type { WorkoutData } from "./workout-types";

export type WorkoutProgress = {
  /** Completed working (non-warmup) sets. */
  completedSets: number;
  /** All working (non-warmup) sets, done or not. */
  totalSets: number;
  /** Σ weight × reps over completed working sets. */
  volume: number;
  /** Exercises whose working sets are all completed (and that have any). */
  exercisesDone: number;
  exerciseCount: number;
  /** 0–1, completedSets / totalSets (0 when there are no sets). */
  ratio: number;
};

/** Live progress of a workout, for the in-session header and summary. */
export function summarizeWorkout(workout: Pick<WorkoutData, "workoutExercises">): WorkoutProgress {
  let completedSets = 0;
  let totalSets = 0;
  let volume = 0;
  let exercisesDone = 0;

  for (const we of workout.workoutExercises) {
    const working = we.sets.filter((s) => !s.isWarmup);
    const done = working.filter((s) => s.isCompleted);
    totalSets += working.length;
    completedSets += done.length;
    for (const s of done) volume += (s.weight ?? 0) * (s.reps ?? 0);
    if (working.length > 0 && done.length === working.length) exercisesDone++;
  }

  return {
    completedSets,
    totalSets,
    volume,
    exercisesDone,
    exerciseCount: workout.workoutExercises.length,
    ratio: totalSets === 0 ? 0 : completedSets / totalSets,
  };
}

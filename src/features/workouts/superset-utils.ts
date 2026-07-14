import type { WorkoutData } from "./workout-types";

/** Exercises sharing a superset group, ordered by their workout position. */
export function supersetMembers(workout: WorkoutData, group: number) {
  return workout.workoutExercises
    .filter((we) => we.supersetGroup === group)
    .sort((a, b) => a.order - b.order);
}

/** Whether a completed set should start the full rest period. */
export function shouldRestAfterExercise(workout: WorkoutData, weId: string): boolean {
  const we = workout.workoutExercises.find((item) => item.id === weId);
  if (!we || we.supersetGroup == null) return true;
  const members = supersetMembers(workout, we.supersetGroup);
  return members[members.length - 1]?.id === weId;
}

import { describe, expect, it } from "vitest";
import { toWatchWorkoutPayload } from "../watch-connectivity";
import type { WorkoutData } from "@/features/workouts/workout-types";

const set = (id: string, setNumber: number, extra: Partial<WorkoutData["workoutExercises"][number]["sets"][number]> = {}) => ({
  id,
  setNumber,
  reps: null,
  weight: null,
  rpe: null,
  isWarmup: false,
  isCompleted: false,
  completedAt: null,
  ...extra,
});

const workout: WorkoutData = {
  id: "w1",
  name: "Calves + forearms",
  notes: null,
  startedAt: "2026-11-04T16:00:00.000Z",
  completedAt: null,
  durationSeconds: null,
  planSessionId: "ps1",
  cardioAfter: true,
  restTimerDefaultSeconds: 120,
  workoutExercises: [
    {
      id: "we1",
      exerciseId: "e1",
      order: 0,
      supersetGroup: null,
      notes: null,
      isCompleted: false,
      repMin: 8,
      repMax: 12,
      exercise: { id: "e1", name: "Wadenheben", muscleGroup: "CALVES", equipment: "MACHINE" },
      // A warm-up added later has the highest setNumber — the Watch must
      // still get it first, like the phone shows it.
      sets: [set("s1", 1), set("s2", 2), set("s0", 3, { isWarmup: true })],
    },
  ],
};

describe("toWatchWorkoutPayload", () => {
  it("carries the plan day and the cardio-after flag", () => {
    const p = toWatchWorkoutPayload(workout);
    expect(p.planSessionId).toBe("ps1");
    expect(p.cardioAfter).toBe(true);
    expect(toWatchWorkoutPayload({ ...workout, cardioAfter: undefined }).cardioAfter).toBe(false);
  });

  it("orders warm-ups first and passes the rep range", () => {
    const ex = toWatchWorkoutPayload(workout).workoutExercises[0];
    expect(ex.sets.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
    expect([ex.repMin, ex.repMax]).toEqual([8, 12]);
  });

  it("matches last time and the phone's progression suggestion by working-set position", () => {
    const ex = toWatchWorkoutPayload(workout, {
      e1: [
        { setNumber: 1, weight: 60, reps: 12, rpe: null },
        { setNumber: 2, weight: 60, reps: 12, rpe: null },
      ],
    }).workoutExercises[0];
    const [warmup, first, second] = ex.sets;
    expect(warmup.previousWeight).toBeNull();
    expect(warmup.suggestedWeight).toBeNull();
    expect([first.previousWeight, first.previousReps]).toEqual([60, 12]);
    // Every set hit the top of 8–12 → +2.5 kg, back to the bottom of the range.
    expect([first.suggestedWeight, first.suggestedReps]).toEqual([62.5, 8]);
    expect([second.suggestedWeight, second.suggestedReps]).toEqual([62.5, 8]);
  });
});

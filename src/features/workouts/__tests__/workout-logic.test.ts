import { describe, expect, it } from "vitest";
import { buildWarmupRamp } from "../warmup";
import { nextWorkingSet, suggestProgression } from "../progression";
import { sortSetsForDisplay } from "../set-sort";
import { shouldRestAfterExercise, supersetMembers } from "../superset-utils";
import type { WorkoutData, WorkoutExerciseData } from "../workout-types";

describe("buildWarmupRamp", () => {
  it("builds a 50/70/85% ramp rounded to the plate increment", () => {
    expect(buildWarmupRamp(100, "KG")).toEqual([
      { weight: 50, reps: 8 },
      { weight: 70, reps: 5 },
      { weight: 85, reps: 3 },
    ]);
    expect(buildWarmupRamp(225, "LB").map((s) => s.weight)).toEqual([115, 160, 190]);
  });

  it("never goes below one increment and ignores invalid targets", () => {
    expect(buildWarmupRamp(2, "KG").every((s) => s.weight === 2.5)).toBe(true);
    expect(buildWarmupRamp(0, "KG")).toEqual([]);
    expect(buildWarmupRamp(Number.NaN, "KG")).toEqual([]);
  });
});

describe("progression", () => {
  const set = (weight: number | null, reps: number | null, setNumber = 1) => ({
    setNumber,
    weight,
    reps,
    rpe: null,
  });

  it("increases the first set at >= 5 reps and later sets at >= 10 reps", () => {
    expect(nextWorkingSet(set(100, 5), "KG", 0)).toEqual({ weight: 102.5, reps: 5, kind: "increase" });
    expect(nextWorkingSet(set(100, 9), "KG", 1)).toEqual({ weight: 100, reps: 9, kind: "hold" });
    expect(nextWorkingSet(set(100, 10), "LB", 1)).toEqual({ weight: 105, reps: 10, kind: "increase" });
  });

  it("skips incomplete sets and empty history", () => {
    expect(nextWorkingSet(set(null, 5), "KG")).toBeNull();
    expect(suggestProgression([], "KG")).toEqual([]);
    expect(suggestProgression([[set(60, 8), set(null, null, 2), set(60, 12, 3)]], "KG")).toEqual([
      { setIndex: 0, weight: 62.5, reps: 8, kind: "increase" },
      { setIndex: 2, weight: 62.5, reps: 12, kind: "increase" },
    ]);
  });
});

describe("sortSetsForDisplay", () => {
  it("puts warmups first, then orders by set number", () => {
    const sets = [
      { setNumber: 2, isWarmup: false },
      { setNumber: 3, isWarmup: true },
      { setNumber: 1, isWarmup: false },
    ];
    expect(sortSetsForDisplay(sets).map((s) => s.setNumber)).toEqual([3, 1, 2]);
    expect(sets[0]!.setNumber).toBe(2); // input untouched
  });
});

describe("supersets", () => {
  const we = (id: string, order: number, supersetGroup: number | null) =>
    ({ id, order, supersetGroup }) as WorkoutExerciseData;
  const workout = {
    workoutExercises: [we("c", 3, 1), we("a", 1, null), we("b", 2, 1)],
  } as WorkoutData;

  it("lists group members in workout order", () => {
    expect(supersetMembers(workout, 1).map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("only rests after the last exercise of a superset", () => {
    expect(shouldRestAfterExercise(workout, "a")).toBe(true);
    expect(shouldRestAfterExercise(workout, "b")).toBe(false);
    expect(shouldRestAfterExercise(workout, "c")).toBe(true);
    expect(shouldRestAfterExercise(workout, "missing")).toBe(true);
  });
});

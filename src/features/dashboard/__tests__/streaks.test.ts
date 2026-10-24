import { describe, expect, it } from "vitest";
import { computeWeekStreak, weeklyGoalFromSettings } from "../queries";

const d = (iso: string) => new Date(`${iso}T18:00:00Z`);
// 2026-10-19 is a Monday; "now" is Saturday 2026-10-24.
const now = d("2026-10-24");

describe("computeWeekStreak", () => {
  it("counts consecutive weeks that hit the goal, rest days don't matter", () => {
    const workouts = [
      // two weeks ago: 3
      d("2026-10-05"), d("2026-10-07"), d("2026-10-09"),
      // last week: 3
      d("2026-10-12"), d("2026-10-15"), d("2026-10-18"),
      // this week so far: 1 (goal not yet met — must not break the streak)
      d("2026-10-20"),
    ];
    expect(computeWeekStreak(workouts, 3, now)).toBe(2);
  });

  it("includes the current week once its goal is met", () => {
    const workouts = [d("2026-10-12"), d("2026-10-14"), d("2026-10-19"), d("2026-10-21")];
    expect(computeWeekStreak(workouts, 2, now)).toBe(2);
  });

  it("is broken by a missed week and is 0 without data", () => {
    const workouts = [d("2026-09-28"), d("2026-09-30"), d("2026-10-12"), d("2026-10-14")];
    expect(computeWeekStreak(workouts, 2, now)).toBe(1);
    expect(computeWeekStreak([], 3, now)).toBe(0);
  });
});

describe("weeklyGoalFromSettings", () => {
  it("uses the number of training days, defaulting to 3", () => {
    expect(weeklyGoalFromSettings([0, 2, 4, 5])).toBe(4);
    expect(weeklyGoalFromSettings([])).toBe(3);
    expect(weeklyGoalFromSettings(null)).toBe(3);
  });
});

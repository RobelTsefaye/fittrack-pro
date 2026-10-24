import { describe, expect, it } from "vitest";
import { computeWeeklyTarget, weeksElapsedSince, type ActivePlan } from "../nutrition-plan";

const plan: ActivePlan = {
  id: "p1",
  phase: "BULK",
  startDate: new Date("2026-01-05T00:00:00Z"),
  startCalories: 2500,
  weeklyCalorieStep: 100,
  minCalories: null,
  maxCalories: 2800,
  proteinPerKg: 2,
  fatPerKg: 1,
};

describe("weeksElapsedSince", () => {
  it("counts whole weeks and never goes negative", () => {
    expect(weeksElapsedSince(plan.startDate, new Date("2026-01-11T23:00:00Z"))).toBe(0);
    expect(weeksElapsedSince(plan.startDate, new Date("2026-01-12T00:00:00Z"))).toBe(1);
    expect(weeksElapsedSince(plan.startDate, new Date("2025-12-01T00:00:00Z"))).toBe(0);
  });
});

describe("computeWeeklyTarget", () => {
  it("steps calories weekly and derives macros from body weight", () => {
    const t = computeWeeklyTarget(plan, 80, new Date("2026-01-19T00:00:00Z"));
    expect(t.weeksElapsed).toBe(2);
    expect(t.calories).toBe(2700);
    expect(t.protein).toBe(160);
    expect(t.fat).toBe(80);
    // (2700 - 160*4 - 80*9) / 4
    expect(t.carbs).toBe(335);
  });

  it("clamps to the guardrail but reports the raw value", () => {
    const t = computeWeeklyTarget(plan, 80, new Date("2026-03-30T00:00:00Z"));
    expect(t.rawCalories).toBe(2500 + 12 * 100);
    expect(t.calories).toBe(2800);
  });

  it("puts all calories into carbs when body weight is unknown", () => {
    const t = computeWeeklyTarget(plan, null, plan.startDate);
    expect(t).toMatchObject({ protein: 0, fat: 0, carbs: 625, bodyWeightUsed: null });
  });
});

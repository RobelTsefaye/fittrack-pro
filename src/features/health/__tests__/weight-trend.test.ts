import { describe, expect, it } from "vitest";
import {
  buildSuggestion,
  classifyTrend,
  computePeriodSummary,
  computeRollingAverage,
} from "../weight-trend";
import type { WeeklyTarget } from "../nutrition-plan";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("computeRollingAverage", () => {
  it("returns null until enough weigh-ins fall inside the window", () => {
    const entries = [
      { date: day("2026-01-01"), weightKg: 80 },
      { date: day("2026-01-02"), weightKg: 81 },
      { date: day("2026-01-03"), weightKg: 82 },
      { date: day("2026-01-05"), weightKg: 83 },
    ];
    const points = computeRollingAverage(entries, 7);
    expect(points.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
    ]);
    expect(points.slice(0, 4).every((p) => p.rolling7d === null)).toBe(true);
    expect(points[4]!.rolling7d).toBeCloseTo(81.5);
  });

  it("handles empty input", () => {
    expect(computeRollingAverage([], 7)).toEqual([]);
  });
});

describe("computePeriodSummary", () => {
  it("normalizes the delta to a weekly rate", () => {
    const s = computePeriodSummary(
      [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-15", weightKg: 81 },
      ],
      14
    );
    expect(s).toMatchObject({ avgWeightKg: 80.5, deltaKg: 1, count: 2 });
    expect(s.deltaPerWeekKg).toBeCloseTo(0.5);
  });

  it("has no delta with fewer than two points", () => {
    expect(computePeriodSummary([{ date: "2026-01-01", weightKg: 80 }], 7)).toMatchObject({
      avgWeightKg: 80,
      deltaKg: null,
    });
    expect(computePeriodSummary([], 7).avgWeightKg).toBeNull();
  });
});

describe("classifyTrend", () => {
  it("uses a ±0.1 %/week dead band", () => {
    expect(classifyTrend(null)).toBeNull();
    expect(classifyTrend(0.2)).toBe("rising");
    expect(classifyTrend(0.05)).toBe("stable");
    expect(classifyTrend(-0.2)).toBe("falling");
  });
});

describe("buildSuggestion", () => {
  const target = { calories: 2600 } as WeeklyTarget;

  it("bumps calories on a flat bulk and trims a too-fast one", () => {
    expect(buildSuggestion("BULK", 0.05, target)?.kind).toBe("bump_calories");
    expect(buildSuggestion("BULK", 0.8, target)).toMatchObject({
      kind: "reduce_calories",
      proposedWeeklyCalorieStep: -50,
      proposedStartCalories: 2600,
    });
    expect(buildSuggestion("BULK", 0.3, target)).toBeNull();
  });

  it("handles cut and maintenance phases", () => {
    expect(buildSuggestion("CUT", -0.1, target)?.reasonKey).toMatch(/cutTooSlow/);
    expect(buildSuggestion("CUT", -1.5, target)?.reasonKey).toMatch(/cutTooFast/);
    expect(buildSuggestion("MAINTENANCE", 0.3, target)?.kind).toBe("reduce_calories");
    expect(buildSuggestion("REVERSE_DIET", -0.3, target)).toBeNull();
    expect(buildSuggestion("BULK", null, target)).toBeNull();
  });
});

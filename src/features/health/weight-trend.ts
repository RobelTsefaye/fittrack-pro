import { prisma } from "@/lib/prisma";
import { lbToKg } from "@/lib/units";
import { getActivePlan, computeWeeklyTarget, type WeeklyTarget } from "./nutrition-plan";
import type { NutritionPhase } from "@/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_WINDOW_DAYS = 7;
const MIN_DAYS_IN_WINDOW = 4; // of 7 — density gate, no interpolated guessing
const LOOKBACK_DAYS = 21; // enough for two rolling-avg windows plus warmup

export type WeightTrendPoint = { date: string; rolling7d: number | null };

export type TrendSuggestion = {
  kind: "bump_calories" | "reduce_calories";
  reasonKey: string;
  proposedWeeklyCalorieStep: number;
  proposedStartCalories: number;
};

export type WeightTrendResult = {
  points: WeightTrendPoint[];
  thisWeekAvg: number | null;
  lastWeekAvg: number | null;
  weeklyRateKg: number | null;
  weeklyRatePctBodyweight: number | null;
  trend: "rising" | "stable" | "falling" | null;
  suggestion: TrendSuggestion | null;
};

// Target weekly rate as %bodyweight/week per phase. A single tunable
// constant table — adjust here, no schema change needed.
const TARGET_RATE_PCT_PER_WEEK: Record<NutritionPhase, { min: number; max: number }> = {
  BULK: { min: 0.15, max: 0.5 },
  REVERSE_DIET: { min: -0.15, max: 0.15 },
  MAINTENANCE: { min: -0.15, max: 0.15 },
  CUT: { min: -1.0, max: -0.3 },
};

const CALORIE_STEP_ADJUSTMENT = 50;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Computes a per-day rolling average over `windowDays`, requiring at least
 * MIN_DAYS_IN_WINDOW of `windowDays` entries present in the trailing window
 * — otherwise the point is null (no interpolated guessing for sparse data).
 */
export function computeRollingAverage(
  entries: { date: Date; weightKg: number }[],
  windowDays: number
): WeightTrendPoint[] {
  if (entries.length === 0) return [];

  const byDate = new Map<string, number>();
  for (const e of entries) byDate.set(dateKey(e.date), e.weightKg);

  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const start = sorted[0]!.date;
  const end = sorted[sorted.length - 1]!.date;

  const points: WeightTrendPoint[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const day = new Date(t);
    const windowValues: number[] = [];
    for (let w = 0; w < windowDays; w++) {
      const wDate = new Date(t - w * DAY_MS);
      const v = byDate.get(dateKey(wDate));
      if (v != null) windowValues.push(v);
    }
    const rolling7d =
      windowValues.length >= MIN_DAYS_IN_WINDOW
        ? windowValues.reduce((s, v) => s + v, 0) / windowValues.length
        : null;
    points.push({ date: dateKey(day), rolling7d });
  }
  return points;
}

export function classifyTrend(
  weeklyRatePctBodyweight: number | null
): "rising" | "stable" | "falling" | null {
  if (weeklyRatePctBodyweight == null) return null;
  if (weeklyRatePctBodyweight > 0.1) return "rising";
  if (weeklyRatePctBodyweight < -0.1) return "falling";
  return "stable";
}

export function buildSuggestion(
  phase: NutritionPhase,
  weeklyRatePctBodyweight: number | null,
  currentTarget: WeeklyTarget
): TrendSuggestion | null {
  if (weeklyRatePctBodyweight == null) return null;

  const { min, max } = TARGET_RATE_PCT_PER_WEEK[phase];

  if (phase === "BULK") {
    if (weeklyRatePctBodyweight < min) {
      return {
        kind: "bump_calories",
        reasonKey: "health.nutrition.suggestion.bulkFlat",
        proposedWeeklyCalorieStep: CALORIE_STEP_ADJUSTMENT,
        proposedStartCalories: currentTarget.calories,
      };
    }
    if (weeklyRatePctBodyweight > max) {
      return {
        kind: "reduce_calories",
        reasonKey: "health.nutrition.suggestion.bulkTooFast",
        proposedWeeklyCalorieStep: -CALORIE_STEP_ADJUSTMENT,
        proposedStartCalories: currentTarget.calories,
      };
    }
    return null;
  }

  if (phase === "REVERSE_DIET" || phase === "MAINTENANCE") {
    if (weeklyRatePctBodyweight > max) {
      return {
        kind: "reduce_calories",
        reasonKey: "health.nutrition.suggestion.reverseGainingTooFast",
        proposedWeeklyCalorieStep: -CALORIE_STEP_ADJUSTMENT,
        proposedStartCalories: currentTarget.calories,
      };
    }
    return null;
  }

  // CUT
  if (weeklyRatePctBodyweight > max) {
    return {
      kind: "reduce_calories",
      reasonKey: "health.nutrition.suggestion.cutTooSlow",
      proposedWeeklyCalorieStep: -CALORIE_STEP_ADJUSTMENT,
      proposedStartCalories: currentTarget.calories,
    };
  }
  if (weeklyRatePctBodyweight < min) {
    return {
      kind: "bump_calories",
      reasonKey: "health.nutrition.suggestion.cutTooFast",
      proposedWeeklyCalorieStep: CALORIE_STEP_ADJUSTMENT,
      proposedStartCalories: currentTarget.calories,
    };
  }
  return null;
}

export async function getWeightTrend(userId: string): Promise<WeightTrendResult> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);

  const [rows, settings, plan] = await Promise.all([
    prisma.bodyWeight.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.userSettings.findUnique({ where: { userId }, select: { weightUnit: true } }),
    getActivePlan(userId),
  ]);

  const isLb = settings?.weightUnit === "LB";
  const entries = rows.map((r) => ({
    date: r.date,
    weightKg: isLb ? lbToKg(r.weight) : r.weight,
  }));

  const points = computeRollingAverage(entries, ROLLING_WINDOW_DAYS);

  const today = new Date();
  const thisWeekAvg = points.length > 0 ? points[points.length - 1]!.rolling7d : null;

  const lastWeekKey = dateKey(new Date(today.getTime() - 7 * DAY_MS));
  const lastWeekPoint = points.find((p) => p.date === lastWeekKey);
  const lastWeekAvg = lastWeekPoint?.rolling7d ?? null;

  const weeklyRateKg =
    thisWeekAvg != null && lastWeekAvg != null ? thisWeekAvg - lastWeekAvg : null;
  const weeklyRatePctBodyweight =
    weeklyRateKg != null && lastWeekAvg != null && lastWeekAvg !== 0
      ? (weeklyRateKg / lastWeekAvg) * 100
      : null;

  const trend = classifyTrend(weeklyRatePctBodyweight);

  let suggestion: TrendSuggestion | null = null;
  if (plan) {
    const bodyWeightKg = entries.length > 0 ? entries[entries.length - 1]!.weightKg : null;
    const currentTarget = computeWeeklyTarget(plan, bodyWeightKg, today);
    suggestion = buildSuggestion(plan.phase, weeklyRatePctBodyweight, currentTarget);
  }

  return {
    points,
    thisWeekAvg,
    lastWeekAvg,
    weeklyRateKg,
    weeklyRatePctBodyweight,
    trend,
    suggestion,
  };
}

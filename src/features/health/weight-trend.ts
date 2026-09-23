import { prisma } from "@/lib/prisma";
import { lbToKg } from "@/lib/units";
import { getActivePlan, computeWeeklyTarget, type WeeklyTarget } from "./nutrition-plan";
import type { NutritionPhase } from "@/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_WINDOW_DAYS = 7;
const MIN_DAYS_IN_WINDOW = 4; // of 7 — density gate, no interpolated guessing
const LOOKBACK_DAYS = 21; // enough for two rolling-avg windows plus warmup

export type WeightTrendPoint = { date: string; rolling7d: number | null };
export type RawWeightPoint = { date: string; weightKg: number };

export type TrendSuggestion = {
  kind: "bump_calories" | "reduce_calories";
  reasonKey: string;
  proposedWeeklyCalorieStep: number;
  proposedStartCalories: number;
};

export type PeriodSummary = {
  days: number;
  avgWeightKg: number | null; // mean of raw entries within the requested display window
  deltaKg: number | null; // last entry − first entry within the window
  deltaPerWeekKg: number | null; // deltaKg normalized to a 7-day rate (comparable across window sizes)
  count: number; // number of weigh-ins within the window
};

export type WeightTrendResult = {
  points: WeightTrendPoint[];
  rawPoints: RawWeightPoint[]; // individual weigh-ins within the requested display window (not smoothed)
  period: PeriodSummary;
  phase: NutritionPhase | null; // active plan's phase, so the UI can frame loss/gain against the actual goal
  thisWeekAvg: number | null;
  lastWeekAvg: number | null;
  weeklyRateKg: number | null;
  weeklyRatePctBodyweight: number | null;
  trend: "rising" | "stable" | "falling" | null;
  suggestion: TrendSuggestion | null;
};

export const DISPLAY_WINDOW_OPTIONS = [7, 14, 30] as const;
export type DisplayWindowDays = (typeof DISPLAY_WINDOW_OPTIONS)[number];

export type CalendarWeekSummary = {
  weekStart: string; // YYYY-MM-DD, Monday
  weekEnd: string; // YYYY-MM-DD, Sunday
  avgWeightKg: number | null;
  weightEntryCount: number;
  avgCalories: number | null; // mean of logged dietaryCalories that week
  calorieEntryCount: number;
  deltaVsPrevWeekKg: number | null; // avgWeightKg − previous calendar week's avgWeightKg
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

/** Monday 00:00 UTC of the week containing `d` — matches cardio.ts's startOfIsoWeek. */
function startOfIsoWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
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

/**
 * Pure. Summarizes raw (non-smoothed) weigh-ins within a display window:
 * average, and total change normalized to a per-week rate so periods of
 * different length stay comparable.
 */
export function computePeriodSummary(
  rawPoints: RawWeightPoint[],
  days: number
): PeriodSummary {
  if (rawPoints.length === 0) {
    return { days, avgWeightKg: null, deltaKg: null, deltaPerWeekKg: null, count: 0 };
  }

  const avgWeightKg =
    rawPoints.reduce((sum, p) => sum + p.weightKg, 0) / rawPoints.length;

  if (rawPoints.length < 2) {
    return { days, avgWeightKg, deltaKg: null, deltaPerWeekKg: null, count: rawPoints.length };
  }

  const first = rawPoints[0]!;
  const last = rawPoints[rawPoints.length - 1]!;
  const deltaKg = last.weightKg - first.weightKg;
  const spanDays = Math.max(
    1,
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / DAY_MS
  );
  const deltaPerWeekKg = deltaKg / (spanDays / 7);

  return { days, avgWeightKg, deltaKg, deltaPerWeekKg, count: rawPoints.length };
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
        reasonKey: "health.nutritionPlan.suggestion.bulkFlat",
        proposedWeeklyCalorieStep: CALORIE_STEP_ADJUSTMENT,
        proposedStartCalories: currentTarget.calories,
      };
    }
    if (weeklyRatePctBodyweight > max) {
      return {
        kind: "reduce_calories",
        reasonKey: "health.nutritionPlan.suggestion.bulkTooFast",
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
        reasonKey: "health.nutritionPlan.suggestion.reverseGainingTooFast",
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
      reasonKey: "health.nutritionPlan.suggestion.cutTooSlow",
      proposedWeeklyCalorieStep: -CALORIE_STEP_ADJUSTMENT,
      proposedStartCalories: currentTarget.calories,
    };
  }
  if (weeklyRatePctBodyweight < min) {
    return {
      kind: "bump_calories",
      reasonKey: "health.nutritionPlan.suggestion.cutTooFast",
      proposedWeeklyCalorieStep: CALORIE_STEP_ADJUSTMENT,
      proposedStartCalories: currentTarget.calories,
    };
  }
  return null;
}

/**
 * Buckets weight + dietary-calorie history into Monday–Sunday calendar
 * weeks (not rolling windows) — for the "I adjust calories every Monday"
 * review flow. Returns the last `weeks` weeks, oldest first, including the
 * current (possibly incomplete) week.
 */
export async function getCalendarWeekHistory(
  userId: string,
  weeks: number = 6
): Promise<CalendarWeekSummary[]> {
  const thisWeekStart = startOfIsoWeek(new Date());
  // Fetch one extra week back so the oldest returned week still gets a
  // deltaVsPrevWeekKg baseline instead of null.
  const since = new Date(thisWeekStart.getTime() - weeks * 7 * DAY_MS);

  const [weightRows, snapshotRows, settings] = await Promise.all([
    prisma.bodyWeight.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.healthSnapshot.findMany({
      where: { userId, date: { gte: since }, dietaryCalories: { not: null } },
      orderBy: { date: "asc" },
      select: { date: true, dietaryCalories: true },
    }),
    prisma.userSettings.findUnique({ where: { userId }, select: { weightUnit: true } }),
  ]);

  const isLb = settings?.weightUnit === "LB";

  const weightByWeek = new Map<string, number[]>();
  for (const row of weightRows) {
    const wk = dateKey(startOfIsoWeek(row.date));
    const kg = isLb ? lbToKg(row.weight) : row.weight;
    const bucket = weightByWeek.get(wk) ?? [];
    bucket.push(kg);
    weightByWeek.set(wk, bucket);
  }

  const caloriesByWeek = new Map<string, number[]>();
  for (const row of snapshotRows) {
    if (row.dietaryCalories == null) continue;
    const wk = dateKey(startOfIsoWeek(row.date));
    const bucket = caloriesByWeek.get(wk) ?? [];
    bucket.push(row.dietaryCalories);
    caloriesByWeek.set(wk, bucket);
  }

  const avg = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;

  // weeks + 1 so the earliest displayed week has a prior-week baseline for its delta.
  const allWeekStarts: Date[] = [];
  for (let i = weeks; i >= 0; i--) {
    allWeekStarts.push(new Date(thisWeekStart.getTime() - i * 7 * DAY_MS));
  }

  const withAvgWeight = allWeekStarts.map((ws) => {
    const key = dateKey(ws);
    return { weekStart: ws, avgWeightKg: avg(weightByWeek.get(key) ?? []) };
  });

  const result: CalendarWeekSummary[] = [];
  for (let i = 1; i < withAvgWeight.length; i++) {
    const cur = withAvgWeight[i]!;
    const prev = withAvgWeight[i - 1]!;
    const weekEnd = new Date(cur.weekStart.getTime() + 6 * DAY_MS);
    const key = dateKey(cur.weekStart);
    const weightBucket = weightByWeek.get(key) ?? [];
    const calorieBucket = caloriesByWeek.get(key) ?? [];

    result.push({
      weekStart: key,
      weekEnd: dateKey(weekEnd),
      avgWeightKg: cur.avgWeightKg,
      weightEntryCount: weightBucket.length,
      avgCalories: avg(calorieBucket),
      calorieEntryCount: calorieBucket.length,
      deltaVsPrevWeekKg:
        cur.avgWeightKg != null && prev.avgWeightKg != null
          ? cur.avgWeightKg - prev.avgWeightKg
          : null,
    });
  }

  return result;
}

export async function getWeightTrend(
  userId: string,
  displayDays: number = 14
): Promise<WeightTrendResult> {
  // The 7d-rolling/suggestion machinery needs at least LOOKBACK_DAYS of
  // history regardless of what the user wants to *see* — fetch the wider of
  // the two so a 7-day display window doesn't starve the underlying trend calc.
  const fetchDays = Math.max(displayDays, LOOKBACK_DAYS);
  const since = new Date(Date.now() - fetchDays * DAY_MS);

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

  const displaySince = new Date(Date.now() - displayDays * DAY_MS);
  const rawPoints: RawWeightPoint[] = entries
    .filter((e) => e.date.getTime() >= displaySince.getTime())
    .map((e) => ({ date: dateKey(e.date), weightKg: e.weightKg }));
  const period = computePeriodSummary(rawPoints, displayDays);

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
    rawPoints,
    period,
    phase: plan?.phase ?? null,
    thisWeekAvg,
    lastWeekAvg,
    weeklyRateKg,
    weeklyRatePctBodyweight,
    trend,
    suggestion,
  };
}

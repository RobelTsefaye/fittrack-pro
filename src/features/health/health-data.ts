import { prisma } from "@/lib/prisma";
import type { HealthSnapshot } from "./types";

/**
 * Server-side fetch of recent health snapshots in the `GET /api/health-data`
 * shape (dates as ISO strings), so health pages can render without the
 * client fetch waterfall.
 */
export async function getHealthSnapshots(
  userId: string,
  limit = 30
): Promise<HealthSnapshot[]> {
  // Newest N, returned in ascending order (charts expect oldest → newest).
  const rows = await prisma.healthSnapshot.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: Math.min(limit, 365),
  });
  return JSON.parse(JSON.stringify(rows.reverse())) as HealthSnapshot[];
}

export type NutritionTrendDay = {
  date: string;
  dietaryCalories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type NutritionTrend = {
  days: NutritionTrendDay[];
  loggedDays: number;
  averages: {
    dietaryCalories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  };
  macroSplit: {
    proteinPct: number | null;
    carbsPct: number | null;
    fatPct: number | null;
  } | null;
};

/**
 * Daily calorie intake and macro breakdown from HealthSnapshot, aggregated
 * over a trailing window. macroSplit is derived from macro grams (protein/carbs
 * = 4 kcal/g, fat = 9 kcal/g), not from `dietaryCalories`, so it stays
 * consistent even when the two disagree slightly.
 */
export async function getNutritionTrend(userId: string, days = 30): Promise<NutritionTrend> {
  const capped = Math.min(days, 180);
  const rows = await prisma.healthSnapshot.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: capped,
    select: { date: true, dietaryCalories: true, protein: true, carbs: true, fat: true },
  });

  const ordered = [...rows].reverse();
  const trendDays: NutritionTrendDay[] = ordered.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    dietaryCalories: r.dietaryCalories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
  }));

  const withCalories = trendDays.filter((d) => d.dietaryCalories != null);
  const withMacros = trendDays.filter(
    (d) => d.protein != null || d.carbs != null || d.fat != null
  );

  const avg = (vals: number[]): number | null =>
    vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;

  const averages = {
    dietaryCalories: avg(withCalories.map((d) => d.dietaryCalories!)),
    protein: avg(trendDays.filter((d) => d.protein != null).map((d) => d.protein!)),
    carbs: avg(trendDays.filter((d) => d.carbs != null).map((d) => d.carbs!)),
    fat: avg(trendDays.filter((d) => d.fat != null).map((d) => d.fat!)),
  };

  let macroSplit: NutritionTrend["macroSplit"] = null;
  if (averages.protein != null || averages.carbs != null || averages.fat != null) {
    const proteinKcal = (averages.protein ?? 0) * 4;
    const carbsKcal = (averages.carbs ?? 0) * 4;
    const fatKcal = (averages.fat ?? 0) * 9;
    const totalKcal = proteinKcal + carbsKcal + fatKcal;
    macroSplit =
      totalKcal > 0
        ? {
            proteinPct: Math.round((proteinKcal / totalKcal) * 1000) / 10,
            carbsPct: Math.round((carbsKcal / totalKcal) * 1000) / 10,
            fatPct: Math.round((fatKcal / totalKcal) * 1000) / 10,
          }
        : null;
  }

  return {
    days: trendDays,
    loggedDays: withCalories.length || withMacros.length,
    averages,
    macroSplit,
  };
}

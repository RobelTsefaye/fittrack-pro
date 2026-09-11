import { prisma } from "@/lib/prisma";
import { clamp } from "@/lib/trend-math";
import { lbToKg } from "@/lib/units";
import type { NutritionPhase } from "@/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivePlan = {
  id: string;
  phase: NutritionPhase;
  startDate: Date;
  startCalories: number;
  weeklyCalorieStep: number;
  minCalories: number | null;
  maxCalories: number | null;
  proteinPerKg: number;
  fatPerKg: number;
};

export type WeeklyTarget = {
  calories: number; // after guardrail clamp
  rawCalories: number; // before clamp, for UI transparency
  weeksElapsed: number;
  protein: number; // grams
  fat: number; // grams
  carbs: number; // grams, remainder after protein+fat kcal
  bodyWeightUsed: number | null; // kg
  isPersonalized: true; // marker distinguishing this from the static fallback
};

/** floor((asOf - startDate) / 7 days), minimum 0. */
export function weeksElapsedSince(startDate: Date, asOf: Date): number {
  const days = Math.floor((asOf.getTime() - startDate.getTime()) / DAY_MS);
  return Math.max(0, Math.floor(days / 7));
}

export function computeWeeklyTarget(
  plan: ActivePlan,
  bodyWeightKg: number | null,
  asOf: Date
): WeeklyTarget {
  const weeksElapsed = weeksElapsedSince(plan.startDate, asOf);
  const rawCalories = plan.startCalories + weeksElapsed * plan.weeklyCalorieStep;
  const calories = clamp(
    rawCalories,
    plan.minCalories ?? -Infinity,
    plan.maxCalories ?? Infinity
  );

  const proteinG = bodyWeightKg != null ? plan.proteinPerKg * bodyWeightKg : 0;
  const fatG = bodyWeightKg != null ? plan.fatPerKg * bodyWeightKg : 0;
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbsG = Math.max(0, calories - proteinKcal - fatKcal) / 4;

  return {
    calories: Math.round(calories),
    rawCalories: Math.round(rawCalories),
    weeksElapsed,
    protein: Math.round(proteinG),
    fat: Math.round(fatG),
    carbs: Math.round(carbsG),
    bodyWeightUsed: bodyWeightKg,
    isPersonalized: true,
  };
}

export async function getActivePlan(userId: string): Promise<ActivePlan | null> {
  const row = await prisma.nutritionPlan.findFirst({
    where: { userId, endDate: null },
    orderBy: { startDate: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    phase: row.phase,
    startDate: row.startDate,
    startCalories: row.startCalories,
    weeklyCalorieStep: row.weeklyCalorieStep,
    minCalories: row.minCalories,
    maxCalories: row.maxCalories,
    proteinPerKg: row.proteinPerKg,
    fatPerKg: row.fatPerKg,
  };
}

async function getLatestBodyWeightKg(userId: string): Promise<number | null> {
  const [latestWeight, settings] = await Promise.all([
    prisma.bodyWeight.findFirst({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.userSettings.findUnique({ where: { userId }, select: { weightUnit: true } }),
  ]);
  if (latestWeight == null) return null;
  return settings?.weightUnit === "LB" ? lbToKg(latestWeight.weight) : latestWeight.weight;
}

/**
 * Fetches the active plan (if any) + latest BodyWeight (converted to kg via
 * UserSettings.weightUnit) and returns the computed WeeklyTarget, or null if
 * no active plan exists — caller falls back to the static config.
 */
export async function getCurrentWeeklyTarget(userId: string): Promise<WeeklyTarget | null> {
  const plan = await getActivePlan(userId);
  if (!plan) return null;

  const bodyWeightKg = await getLatestBodyWeightKg(userId);
  return computeWeeklyTarget(plan, bodyWeightKg, new Date());
}

export { getLatestBodyWeightKg };

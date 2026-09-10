"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { loadHealthCache, saveHealthCache } from "@/lib/offline/screen-caches";
import { CALORIE_TARGET_DEFAULT, MACRO_TARGETS } from "../nutrition-config";

export type WeeklyNutritionTarget = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isPersonalized: boolean;
};

function staticFallback(): WeeklyNutritionTarget {
  const targetOf = (key: string) => MACRO_TARGETS.find((t) => t.key === key)?.target ?? 0;
  return {
    calories: CALORIE_TARGET_DEFAULT,
    protein: targetOf("protein"),
    carbs: targetOf("carbs"),
    fat: targetOf("fat"),
    isPersonalized: false,
  };
}

const CACHE_KEY = "weekly-nutrition-target";

/**
 * Resolves this week's calorie/macro target: from the active NutritionPlan
 * when one exists (computed server-side by GET /api/nutrition-plan's active
 * plan via the /weight-trend route's shared computation), else the static
 * defaults in nutrition-config.ts.
 */
export function useWeeklyNutritionTarget(): { target: WeeklyNutritionTarget; loading: boolean } {
  const [target, setTarget] = useState<WeeklyNutritionTarget>(staticFallback());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadHealthCache<WeeklyNutritionTarget>(CACHE_KEY);
      if (cancelled) return;
      if (cached) {
        setTarget(cached);
        setLoading(false);
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cached) setLoading(false);
        return;
      }

      try {
        const res = await authenticatedFetch("/api/nutrition-plan/current-target", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: WeeklyNutritionTarget };
        if (!cancelled) {
          setTarget(json.data);
          void saveHealthCache(CACHE_KEY, json.data);
        }
      } catch {
        // already showing cache/fallback — nothing more to do
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { target, loading };
}

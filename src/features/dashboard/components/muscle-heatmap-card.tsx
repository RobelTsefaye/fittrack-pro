"use client";

import { useEffect, useState } from "react";
import { MuscleHeatmap } from "./muscle-heatmap";
import type { MuscleHeatEntry } from "@/services/muscle-heatmap";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { saveMuscleHeatmapCache, loadMuscleHeatmapCache } from "@/lib/offline/screen-caches";

// Client component — was an async Server Component calling
// getMuscleVolumeLastDays + a direct settings lookup; converted to fetch the
// new /api/dashboard/muscle-heatmap route instead (see
// project-docs/offline-first-roadmap.md Phase 2). `userId` prop dropped —
// the route resolves the user from the request's own auth, same as every
// other converted page/component.
type MuscleHeatmapCached = { entries: MuscleHeatEntry[]; weightUnit: string };

export function MuscleHeatmapCard() {
  const [data, setData] = useState<MuscleHeatEntry[] | null>(null);
  const [unit, setUnit] = useState("kg");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = await loadMuscleHeatmapCache<MuscleHeatmapCached>();
        if (!cancelled && cached) { setData(cached.entries); setUnit(cached.weightUnit); }
        return;
      }
      try {
        const res = await authenticatedFetch("/api/dashboard/muscle-heatmap", { credentials: "include" });
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (json?.data) {
          setData(json.data.entries);
          setUnit(json.data.weightUnit);
          void saveMuscleHeatmapCache({ entries: json.data.entries, weightUnit: json.data.weightUnit });
        } else {
          const cached = await loadMuscleHeatmapCache<MuscleHeatmapCached>();
          if (!cancelled && cached) { setData(cached.entries); setUnit(cached.weightUnit); }
        }
      } catch {
        const cached = await loadMuscleHeatmapCache<MuscleHeatmapCached>();
        if (!cancelled && cached) { setData(cached.entries); setUnit(cached.weightUnit); }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="ios-group px-4 py-4 space-y-1">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[0.9375rem] font-semibold">Muscle Map</h2>
        <span className="text-xs text-[var(--sys-label3)]">Last 7 days</span>
      </div>
      {data == null ? null : data.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--sys-label3)]">
          Complete a workout to see your muscle map.
        </p>
      ) : (
        <MuscleHeatmap data={data} weightUnit={unit} />
      )}
    </div>
  );
}

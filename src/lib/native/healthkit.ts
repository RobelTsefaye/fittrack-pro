"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  queryDailySnapshots(options: { days: number }): Promise<{ data: Record<string, unknown>[] }>;
  queryWorkouts(options: { days: number }): Promise<{ data: Record<string, unknown>[] }>;
}

const HealthKit = registerPlugin<HealthKitPlugin>("HealthKit");

/**
 * Requests HealthKit read access. Safe to call unconditionally — no-ops on
 * web/PWA where the native plugin isn't registered.
 */
export async function requestHealthKitAuthorization(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await HealthKit.isAvailable();
    if (!available) return false;
    const { granted } = await HealthKit.requestAuthorization();
    return granted;
  } catch (err) {
    console.error("[healthkit] authorization failed", err);
    return false;
  }
}

/**
 * Pulls the last `days` of vitals + workouts directly from HealthKit and
 * posts them to the same /api/health-data endpoint Health Auto Export uses.
 * Daily snapshots are posted in the PLAIN (non-HAE) shape the endpoint
 * already supports — one POST per day is unnecessary; the endpoint accepts
 * a single object per call, so we send them sequentially. Workouts are
 * wrapped in the HAE-compatible `{ data: { workouts: [...] } }` envelope so
 * the existing transformHAEWorkout() parsing/unit-normalization is reused
 * without any backend changes.
 *
 * Call this on app foreground/resume — see native-health-sync.tsx.
 */
export async function syncHealthKitData(days = 14): Promise<{ snapshots: number; workouts: number }> {
  if (!Capacitor.isNativePlatform()) return { snapshots: 0, workouts: 0 };

  let snapshotCount = 0;
  let workoutCount = 0;

  try {
    const { data: snapshots } = await HealthKit.queryDailySnapshots({ days });
    for (const snapshot of snapshots) {
      const res = await fetch("/api/health-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(snapshot),
      });
      if (res.ok) snapshotCount++;
    }
  } catch (err) {
    console.error("[healthkit] daily snapshot sync failed", err);
  }

  try {
    const { data: workouts } = await HealthKit.queryWorkouts({ days: Math.max(days, 30) });
    if (workouts.length > 0) {
      const res = await fetch("/api/health-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: { workouts } }),
      });
      if (res.ok) {
        const json = (await res.json()) as { workoutsImported?: number };
        workoutCount = json.workoutsImported ?? workouts.length;
      }
    }
  } catch (err) {
    console.error("[healthkit] workout sync failed", err);
  }

  return { snapshots: snapshotCount, workouts: workoutCount };
}

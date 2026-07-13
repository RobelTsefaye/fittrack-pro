"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  queryDailySnapshots(options: { days: number }): Promise<{ data: Record<string, unknown>[] }>;
  queryWorkouts(options: { days: number }): Promise<{ data: Record<string, unknown>[] }>;
}

const HealthKit = registerPlugin<HealthKitPlugin>("HealthKit");

const INITIAL_SYNC_DAYS = 90;
const ROUTINE_SYNC_DAYS = 2;
const LAST_SUCCESSFUL_SYNC_KEY = "fittrack-healthkit-last-successful-sync";
const DAY_MS = 24 * 60 * 60 * 1000;

export type HealthKitSyncResult = {
  snapshots: number;
  workouts: number;
  days: number;
  completed: boolean;
};

let activeSync: Promise<HealthKitSyncResult> | null = null;

function daysToSync(now: number): number {
  try {
    const lastSuccessfulSync = Number(localStorage.getItem(LAST_SUCCESSFUL_SYNC_KEY));
    if (!Number.isFinite(lastSuccessfulSync) || lastSuccessfulSync <= 0 || lastSuccessfulSync > now) {
      return INITIAL_SYNC_DAYS;
    }

    // Re-read yesterday even after a successful sync: sleep and Watch data
    // regularly settle after midnight. If the app was offline, fill the gap
    // plus that one-day safety overlap.
    const missedDays = Math.ceil((now - lastSuccessfulSync) / DAY_MS);
    return Math.min(INITIAL_SYNC_DAYS, Math.max(ROUTINE_SYNC_DAYS, missedDays + 1));
  } catch {
    return INITIAL_SYNC_DAYS;
  }
}

function markSyncSuccessful(now: number) {
  try {
    localStorage.setItem(LAST_SUCCESSFUL_SYNC_KEY, String(now));
  } catch {
    // A later sync can safely fall back to the initial import window.
  }
}

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
 * Pulls recent vitals + workouts directly from HealthKit and
 * posts them to the same /api/health-data endpoint Health Auto Export uses.
 * The first successful native sync imports 90 days. Subsequent syncs read
 * today + yesterday, or fill any days missed while the app was offline.
 * Workouts are
 * wrapped in the HAE-compatible `{ data: { workouts: [...] } }` envelope so
 * the existing transformHAEWorkout() parsing/unit-normalization is reused
 * without any backend changes.
 *
 * Call this on app foreground/resume — see native-health-sync.tsx.
 */
export function syncHealthKitData(days?: number): Promise<HealthKitSyncResult> {
  if (!Capacitor.isNativePlatform()) {
    return Promise.resolve({ snapshots: 0, workouts: 0, days: 0, completed: false });
  }
  // Auto-sync on app launch and a manual refresh can overlap. Share one
  // in-flight operation so they do not both scan and upload the same days.
  if (activeSync) return activeSync;

  const now = Date.now();
  const syncDays = days ?? daysToSync(now);
  activeSync = runHealthKitSync(syncDays, now).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

async function runHealthKitSync(days: number, now: number): Promise<HealthKitSyncResult> {
  let snapshotCount = 0;
  let workoutCount = 0;
  let snapshotsCompleted = false;
  let workoutsCompleted = false;

  try {
    const { data: snapshots } = await HealthKit.queryDailySnapshots({ days });
    let allSnapshotsUploaded = true;
    for (const snapshot of snapshots) {
      const res = await fetch("/api/health-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(snapshot),
      });
      if (res.ok) snapshotCount++;
      else allSnapshotsUploaded = false;
    }
    snapshotsCompleted = allSnapshotsUploaded;
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
      } else {
        return { snapshots: snapshotCount, workouts: workoutCount, days, completed: false };
      }
    }
    workoutsCompleted = true;
  } catch (err) {
    console.error("[healthkit] workout sync failed", err);
  }

  const completed = snapshotsCompleted && workoutsCompleted;
  if (completed) markSyncSuccessful(now);
  return { snapshots: snapshotCount, workouts: workoutCount, days, completed };
}

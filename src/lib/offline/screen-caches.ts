import { tryGetOfflineDb } from "./db";

/**
 * Read-cache helpers for the screens that just need "show last-known JSON
 * offline" — no queue, no conflict handling (see
 * project-docs/offline-first-roadmap.md Phase 3). Workouts, body weight, and
 * the exercise catalog each have their own store file since they also carry
 * write-queue logic; these five are pure read caches, so one small file
 * covers all of them instead of five near-identical ones.
 */

export async function saveDashboardCache<T>(payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.dashboardCache.put({ id: "default", payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadDashboardCache<T>(): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.dashboardCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function saveAchievementsCache<T>(payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.achievementsCache.put({ id: "default", payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadAchievementsCache<T>(): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.achievementsCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function saveMuscleHeatmapCache<T>(payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.muscleHeatmapCache.put({ id: "default", payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadMuscleHeatmapCache<T>(): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.muscleHeatmapCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function savePlansCache<T>(payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.plansCache.put({ id: "default", payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadPlansCache<T>(): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.plansCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

/** `screen` keys the row — one per health sub-screen (dashboard/sleep/recovery/nutrition/cardio). */
export async function saveHealthCache<T>(screen: string, payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.healthCache.put({ id: screen, payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadHealthCache<T>(screen: string): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.healthCache.get(screen);
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

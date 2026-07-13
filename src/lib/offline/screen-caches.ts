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

/** `planId` keys the row — full plan detail (sessions + exercises + targetSets), not just the summary `plansCache` holds. */
export async function savePlanDetailCache<T>(planId: string, payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.planDetailCache.put({ id: planId, payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadPlanDetailCache<T>(planId: string): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.planDetailCache.get(planId);
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

/** `exerciseId` keys the row — the history/analytics payload for one exercise
 *  (project-docs/instant-load-roadmap.md Phase B). Shared by
 *  exercise-detail-view.tsx and most-used-exercises-view.tsx's detail pane. */
export async function saveExerciseDetailCache<T>(exerciseId: string, payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.exerciseDetailCache.put({ id: exerciseId, payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadExerciseDetailCache<T>(exerciseId: string): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.exerciseDetailCache.get(exerciseId);
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function saveMostUsedExercisesCache<T>(payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.mostUsedExercisesCache.put({ id: "default", payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadMostUsedExercisesCache<T>(): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.mostUsedExercisesCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function saveBodyMeasurementsCache<T>(payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.bodyMeasurementsCache.put({ id: "default", payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadBodyMeasurementsCache<T>(): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.bodyMeasurementsCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function saveRecordsCache<T>(payload: T): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.recordsCache.put({ id: "default", payload: JSON.stringify(payload), updatedAt: Date.now() });
}

export async function loadRecordsCache<T>(): Promise<T | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.recordsCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

/** Merges each exercise's entry into `previousLogsCache` (never wholesale-
 *  replaces it) — a single fetch only ever covers the current workout's own
 *  exercises, so overwriting the whole table would drop coverage for every
 *  other exercise the user has previously logged. */
export async function savePreviousLogsCache<T>(byExerciseId: Record<string, T>): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  const now = Date.now();
  await db.previousLogsCache.bulkPut(
    Object.entries(byExerciseId)
      .filter(([, payload]) => payload != null)
      .map(([exerciseId, payload]) => ({
      id: exerciseId,
      payload: JSON.stringify(payload),
      updatedAt: now,
      }))
  );
}

/** Loads whatever's cached for the given exercise ids — missing/uncached
 *  ones are simply absent from the returned record, not an error. */
export async function loadPreviousLogsCache<T>(
  exerciseIds: string[]
): Promise<Record<string, T>> {
  const db = tryGetOfflineDb();
  if (!db || exerciseIds.length === 0) return {};
  const rows = await db.previousLogsCache.bulkGet(exerciseIds);
  const result: Record<string, T> = {};
  rows.forEach((row, i) => {
    if (!row) return;
    try {
      result[exerciseIds[i]] = JSON.parse(row.payload) as T;
    } catch {
      // skip corrupt entry
    }
  });
  return result;
}

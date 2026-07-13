import Dexie, { type Table } from "dexie";

export type WorkoutSnapshotRow = {
  id: string;
  payload: string;
  offlineOrigin: number;
  updatedAt: number;
};

export type QueueRow = {
  id: string;
  workoutRouteId: string;
  sort: number;
  opJson: string;
};

export type CatalogRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type MetaRow = { id: string; queueSeq: number };

export type BodyWeightCacheRow = {
  id: string;
  payload: string;
  updatedAt: number;
};

export type BodyWeightQueueRow = {
  id: string;
  sort: number;
  opJson: string;
};

export type WorkoutListCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type DashboardCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type AchievementsCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type MuscleHeatmapCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type PlansCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type HealthCacheRow = {
  /** One row per health sub-screen: "dashboard", "sleep", "recovery", "nutrition", "cardio". */
  id: string;
  payload: string;
  updatedAt: number;
};

export type PlanDetailCacheRow = {
  /** Keyed by planId — one row per plan, holds the full detail (sessions +
   *  exercises + targetSets), unlike `plansCache` which only holds the
   *  summary list. Needed so a plan session's workout can be built entirely
   *  client-side while offline (see plan-session-offline.ts). */
  id: string;
  payload: string;
  updatedAt: number;
};

export type ExerciseDetailCacheRow = {
  /** Keyed by exerciseId — one row per exercise's history/analytics payload.
   *  Shared by exercise-detail-view.tsx and most-used-exercises-view.tsx's
   *  detail pane (project-docs/instant-load-roadmap.md Phase B). */
  id: string;
  payload: string;
  updatedAt: number;
};

export type MostUsedExercisesCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type BodyMeasurementsCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type RecordsCacheRow = {
  id: "default";
  payload: string;
  updatedAt: number;
};

export type QueueIdMapRow = {
  /** Keyed by the workout's CURRENT workoutRouteId (rekeyed alongside the
   *  queue itself once `post_workout` resolves a real server id). Persists
   *  the clientId → serverId maps for exercises/sets across a partial-flush
   *  failure and retry — without this, a mid-batch failure that already
   *  removed some queue rows would lose track of which server ids those ops
   *  resolved to, and a later `post_set` referencing them would 404 (see
   *  flush-workout-queue.ts). */
  id: string;
  weMapJson: string;
  setMapJson: string;
};

export type PreviousLogCacheRow = {
  /** Keyed by exerciseId — "last time you did THIS exercise" (weight/reps
   *  per set), independent of any particular workout. Accumulates coverage
   *  over time: each fetch only returns entries for the current workout's
   *  exercises, so this is merged in (never wholesale-replaced) — see
   *  savePreviousLogsCache in screen-caches.ts. */
  id: string;
  payload: string;
  updatedAt: number;
};

class FitTrackOfflineDb extends Dexie {
  workouts!: Table<WorkoutSnapshotRow>;
  queue!: Table<QueueRow>;
  catalog!: Table<CatalogRow>;
  meta!: Table<MetaRow>;
  bodyWeightCache!: Table<BodyWeightCacheRow>;
  bodyWeightQueue!: Table<BodyWeightQueueRow>;
  workoutListCache!: Table<WorkoutListCacheRow>;
  dashboardCache!: Table<DashboardCacheRow>;
  achievementsCache!: Table<AchievementsCacheRow>;
  muscleHeatmapCache!: Table<MuscleHeatmapCacheRow>;
  plansCache!: Table<PlansCacheRow>;
  healthCache!: Table<HealthCacheRow>;
  planDetailCache!: Table<PlanDetailCacheRow>;
  exerciseDetailCache!: Table<ExerciseDetailCacheRow>;
  mostUsedExercisesCache!: Table<MostUsedExercisesCacheRow>;
  bodyMeasurementsCache!: Table<BodyMeasurementsCacheRow>;
  recordsCache!: Table<RecordsCacheRow>;
  queueIdMap!: Table<QueueIdMapRow>;
  previousLogsCache!: Table<PreviousLogCacheRow>;

  constructor() {
    super("fittrack_offline_v1");
    this.version(1).stores({
      workouts: "id",
      queue: "id, workoutRouteId, sort",
      catalog: "id",
      meta: "id",
    });
    // version(2) was defined but the DB was already at v10 in some envs, so
    // we add the new tables at v11 to guarantee the upgrade always runs.
    this.version(11).stores({
      workouts: "id",
      queue: "id, workoutRouteId, sort",
      catalog: "id",
      meta: "id",
      bodyWeightCache: "id",
      bodyWeightQueue: "id, sort",
      workoutListCache: "id",
    });
    // Phase 3 read caches for the remaining screens (dashboard, records/
    // achievements, muscle heatmap, plans, health) — see
    // project-docs/offline-first-roadmap.md.
    this.version(12).stores({
      workouts: "id",
      queue: "id, workoutRouteId, sort",
      catalog: "id",
      meta: "id",
      bodyWeightCache: "id",
      bodyWeightQueue: "id, sort",
      workoutListCache: "id",
      dashboardCache: "id",
      achievementsCache: "id",
      muscleHeatmapCache: "id",
      plansCache: "id",
      healthCache: "id",
    });
    // Phase 4 follow-up: offline start of a workout from a plan session
    // needs the full plan detail (exercises + targetSets), not just the
    // summary list `plansCache` holds.
    this.version(13).stores({
      workouts: "id",
      queue: "id, workoutRouteId, sort",
      catalog: "id",
      meta: "id",
      bodyWeightCache: "id",
      bodyWeightQueue: "id, sort",
      workoutListCache: "id",
      dashboardCache: "id",
      achievementsCache: "id",
      muscleHeatmapCache: "id",
      plansCache: "id",
      healthCache: "id",
      planDetailCache: "id",
    });
    // Phase B (project-docs/instant-load-roadmap.md): new cache tables for
    // the screens that had no offline/cache story at all yet — exercise
    // detail (+ most-used's detail pane, same shape), the most-used list,
    // body measurements, and records.
    this.version(14).stores({
      workouts: "id",
      queue: "id, workoutRouteId, sort",
      catalog: "id",
      meta: "id",
      bodyWeightCache: "id",
      bodyWeightQueue: "id, sort",
      workoutListCache: "id",
      dashboardCache: "id",
      achievementsCache: "id",
      muscleHeatmapCache: "id",
      plansCache: "id",
      healthCache: "id",
      planDetailCache: "id",
      exerciseDetailCache: "id",
      mostUsedExercisesCache: "id",
      bodyMeasurementsCache: "id",
      recordsCache: "id",
    });
    // Fixes a data-integrity bug in flush-workout-queue.ts: queue rows used
    // to only get removed once the ENTIRE batch of ops succeeded, so a
    // transient mid-batch failure (e.g. the "online" event firing before the
    // radio is actually up) replayed already-succeeded ops on retry —
    // duplicating the server-side workout while the first attempt's
    // half-completed one lingered "active" forever. Ops are now removed
    // immediately as each one succeeds; this table persists the
    // client-id→server-id maps for exercises/sets across that retry so a
    // later `post_set` can still find the server id its parent
    // `post_exercise` already resolved, even in a different flush call.
    this.version(15).stores({
      workouts: "id",
      queue: "id, workoutRouteId, sort",
      catalog: "id",
      meta: "id",
      bodyWeightCache: "id",
      bodyWeightQueue: "id, sort",
      workoutListCache: "id",
      dashboardCache: "id",
      achievementsCache: "id",
      muscleHeatmapCache: "id",
      plansCache: "id",
      healthCache: "id",
      planDetailCache: "id",
      exerciseDetailCache: "id",
      mostUsedExercisesCache: "id",
      bodyMeasurementsCache: "id",
      recordsCache: "id",
      queueIdMap: "id",
    });
    // "Last time you did this exercise" (weight/reps per set) used to be
    // skipped entirely offline (workout-detail.tsx explicitly bailed out
    // whenever writes were local-only) — this table lets it be shown from
    // cache instead, keyed per exercise so it accumulates coverage across
    // sessions rather than being tied to one specific workout.
    this.version(16).stores({
      workouts: "id",
      queue: "id, workoutRouteId, sort",
      catalog: "id",
      meta: "id",
      bodyWeightCache: "id",
      bodyWeightQueue: "id, sort",
      workoutListCache: "id",
      dashboardCache: "id",
      achievementsCache: "id",
      muscleHeatmapCache: "id",
      plansCache: "id",
      healthCache: "id",
      planDetailCache: "id",
      exerciseDetailCache: "id",
      mostUsedExercisesCache: "id",
      bodyMeasurementsCache: "id",
      recordsCache: "id",
      queueIdMap: "id",
      previousLogsCache: "id",
    });
  }
}

let _db: FitTrackOfflineDb | null = null;

export function getOfflineDb(): FitTrackOfflineDb {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!_db) {
    _db = new FitTrackOfflineDb();
  }
  return _db;
}

export function tryGetOfflineDb(): FitTrackOfflineDb | null {
  if (typeof window === "undefined") return null;
  try {
    return getOfflineDb();
  } catch {
    return null;
  }
}

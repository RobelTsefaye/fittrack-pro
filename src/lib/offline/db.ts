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

class FitTrackOfflineDb extends Dexie {
  workouts!: Table<WorkoutSnapshotRow>;
  queue!: Table<QueueRow>;
  catalog!: Table<CatalogRow>;
  meta!: Table<MetaRow>;
  bodyWeightCache!: Table<BodyWeightCacheRow>;
  bodyWeightQueue!: Table<BodyWeightQueueRow>;
  workoutListCache!: Table<WorkoutListCacheRow>;

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

import type { WorkoutData } from "@/features/workouts/workout-types";
import type { QueuedWorkoutOp } from "./queue-types";
import { getOfflineDb, tryGetOfflineDb } from "./db";

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

async function nextQueueSort(): Promise<number> {
  const db = getOfflineDb();
  const row = await db.meta.get("queue");
  const next = (row?.queueSeq ?? 0) + 1;
  await db.meta.put({ id: "queue", queueSeq: next });
  return next;
}

export async function saveWorkoutSnapshot(
  workoutId: string,
  data: WorkoutData,
  offlineOrigin: boolean
): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.workouts.put({
    id: workoutId,
    payload: JSON.stringify(data),
    offlineOrigin: offlineOrigin ? 1 : 0,
    updatedAt: Date.now(),
  });
}

export async function loadWorkoutSnapshot(workoutId: string): Promise<{
  data: WorkoutData;
  offlineOrigin: boolean;
} | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.workouts.get(workoutId);
  if (!row) return null;
  try {
    const data = JSON.parse(row.payload) as WorkoutData;
    return { data, offlineOrigin: row.offlineOrigin === 1 };
  } catch {
    return null;
  }
}

export async function enqueueWorkoutOp(
  workoutRouteId: string,
  op: QueuedWorkoutOp
): Promise<void> {
  const db = getOfflineDb();
  const sort = await nextQueueSort();
  await db.queue.add({
    id: crypto.randomUUID(),
    workoutRouteId,
    sort,
    opJson: JSON.stringify(op),
  });
}

export async function listQueueForWorkout(workoutRouteId: string): Promise<
  Array<{ id: string; sort: number; op: QueuedWorkoutOp }>
> {
  const db = getOfflineDb();
  const rows = await db.queue.where("workoutRouteId").equals(workoutRouteId).sortBy("sort");
  return rows.map((r) => ({
    id: r.id,
    sort: r.sort,
    op: JSON.parse(r.opJson) as QueuedWorkoutOp,
  }));
}

export async function removeQueueEntries(ids: string[]): Promise<void> {
  const db = getOfflineDb();
  await db.queue.bulkDelete(ids);
}

export async function deleteWorkoutSnapshot(workoutId: string): Promise<void> {
  const db = getOfflineDb();
  await db.workouts.delete(workoutId);
}

/** Every locally-tracked workout that started offline and hasn't finished
 *  syncing yet (flush-workout-queue.ts renames it away from offlineOrigin
 *  once it fully lands) — used to merge still-local workouts into the
 *  Workouts list, which otherwise only knows about what the server has
 *  already seen (see workout-history-list.tsx). */
export async function listOfflineOriginWorkouts(): Promise<WorkoutData[]> {
  const db = tryGetOfflineDb();
  if (!db) return [];
  const rows = await db.workouts.filter((r) => r.offlineOrigin === 1).toArray();
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload) as WorkoutData;
      } catch {
        return null;
      }
    })
    .filter((d): d is WorkoutData => d !== null);
}

export type CatalogExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
};

export async function saveExerciseCatalog(exercises: CatalogExercise[]): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.catalog.put({
    id: "default",
    payload: JSON.stringify(exercises),
    updatedAt: Date.now(),
  });
}

export async function loadExerciseCatalog(): Promise<CatalogExercise[] | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.catalog.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as CatalogExercise[];
  } catch {
    return null;
  }
}

export async function distinctQueuedWorkoutIds(): Promise<string[]> {
  const db = getOfflineDb();
  const rows = await db.queue.toArray();
  return [...new Set(rows.map((r) => r.workoutRouteId))];
}

/** Repoints every still-queued op for `oldId` at `newId` — used once
 *  `post_workout` resolves a real server id, so a retry after a later
 *  mid-batch failure finds the remaining ops under the id it should now
 *  use (see flush-workout-queue.ts). */
export async function rekeyWorkoutQueue(oldId: string, newId: string): Promise<void> {
  const db = getOfflineDb();
  const rows = await db.queue.where("workoutRouteId").equals(oldId).toArray();
  if (rows.length === 0) return;
  await db.queue.bulkPut(rows.map((r) => ({ ...r, workoutRouteId: newId })));
}

export async function saveQueueIdMap(
  routeWorkoutId: string,
  weMap: Map<string, string>,
  setMap: Map<string, string>
): Promise<void> {
  const db = getOfflineDb();
  await db.queueIdMap.put({
    id: routeWorkoutId,
    weMapJson: JSON.stringify([...weMap]),
    setMapJson: JSON.stringify([...setMap]),
  });
}

export async function loadQueueIdMap(
  routeWorkoutId: string
): Promise<{ weMap: Map<string, string>; setMap: Map<string, string> }> {
  const db = getOfflineDb();
  const row = await db.queueIdMap.get(routeWorkoutId);
  if (!row) return { weMap: new Map(), setMap: new Map() };
  try {
    return {
      weMap: new Map(JSON.parse(row.weMapJson)),
      setMap: new Map(JSON.parse(row.setMapJson)),
    };
  } catch {
    return { weMap: new Map(), setMap: new Map() };
  }
}

export async function deleteQueueIdMap(routeWorkoutId: string): Promise<void> {
  const db = getOfflineDb();
  await db.queueIdMap.delete(routeWorkoutId);
}

import type { WorkoutData } from "@/features/workouts/workout-types";
import type { QueuedWorkoutOp } from "./queue-types";
// Type-only — the module also does `import { prisma }` etc., but a
// type-only import is erased at compile time, so none of that server-only
// code ends up in this client-bundled file.
import type { WorkoutListItemDTO } from "@/features/workouts/workouts-list-data";
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

/** Removes every piece of local state for a workout together. Keeping this in
 * one helper prevents a deleted snapshot from leaving replayable queue rows
 * behind (which would otherwise fail forever during the next sync). */
export async function purgeWorkoutLocal(workoutId: string): Promise<void> {
  const db = getOfflineDb();
  await db.transaction("rw", db.queue, db.queueIdMap, db.workouts, async () => {
    const queued = await db.queue.where("workoutRouteId").equals(workoutId).primaryKeys();
    if (queued.length > 0) await db.queue.bulkDelete(queued as string[]);
    await db.queueIdMap.delete(workoutId);
    await db.workouts.delete(workoutId);
  });
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

/** Patches a single entry in the Workouts list's own cache (`workoutListCache`,
 *  see workout-history-list.tsx) in place — called right when a workout's
 *  completedAt actually changes (workout-detail.tsx's completeWorkout,
 *  online or offline), instead of waiting for the list's own next
 *  cache-first mount to show stale "still active" data until a fresh
 *  network fetch lands. No-ops if the workout isn't in that cache yet
 *  (e.g. it only exists locally so far — mergeOfflineWorkouts already
 *  reflects its real state directly from the snapshot). */
export async function patchWorkoutListCacheEntry(
  id: string,
  patch: Partial<Pick<WorkoutListItemDTO, "completedAt" | "durationSeconds">>
): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  const row = await db.workoutListCache.get("default");
  if (!row) return;
  try {
    const list = JSON.parse(row.payload) as WorkoutListItemDTO[];
    const idx = list.findIndex((w) => w.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...patch };
    await db.workoutListCache.put({ id: "default", payload: JSON.stringify(list), updatedAt: Date.now() });
  } catch {
    // Corrupt cache entry — leave it, the next full network fetch overwrites it anyway.
  }
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

/** Atomically moves an offline-origin workout to its server id after the
 * server has accepted `post_workout`. Write the new snapshot before removing
 * the old one so an app termination can never leave queued work snapshotless. */
export async function rekeyWorkoutLocalState(
  oldId: string,
  newId: string,
  data: WorkoutData,
  weMap: Map<string, string>,
  setMap: Map<string, string>,
  completedQueueEntryId: string
): Promise<void> {
  const db = getOfflineDb();
  await db.transaction("rw", db.queue, db.queueIdMap, db.workouts, async () => {
    await db.queue.delete(completedQueueEntryId);
    const rows = await db.queue.where("workoutRouteId").equals(oldId).toArray();
    if (rows.length > 0) {
      await db.queue.bulkPut(rows.map((row) => ({ ...row, workoutRouteId: newId })));
    }
    await db.workouts.put({
      id: newId,
      payload: JSON.stringify({ ...data, id: newId }),
      offlineOrigin: 0,
      updatedAt: Date.now(),
    });
    await db.queueIdMap.put({
      id: newId,
      weMapJson: JSON.stringify([...weMap]),
      setMapJson: JSON.stringify([...setMap]),
    });
    await db.queueIdMap.delete(oldId);
    await db.workouts.delete(oldId);
  });
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

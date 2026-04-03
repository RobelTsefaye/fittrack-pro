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

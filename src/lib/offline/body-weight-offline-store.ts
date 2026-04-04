import { getOfflineDb, tryGetOfflineDb } from "./db";

export type BodyWeightEntry = {
  id: string;
  weight: number;
  date: string;
  notes: string | null;
};

export type BodyWeightOp =
  | { t: "post"; id: string; date: string; weight: number; notes?: string | null }
  | { t: "patch"; id: string; weight: number; notes?: string | null }
  | { t: "delete"; id: string };

async function nextSort(): Promise<number> {
  const db = getOfflineDb();
  const row = await db.meta.get("bwQueue");
  const next = (row?.queueSeq ?? 0) + 1;
  await db.meta.put({ id: "bwQueue", queueSeq: next });
  return next;
}

export async function saveBodyWeightCache(entries: BodyWeightEntry[]): Promise<void> {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.bodyWeightCache.put({
    id: "default",
    payload: JSON.stringify(entries),
    updatedAt: Date.now(),
  });
}

export async function loadBodyWeightCache(): Promise<BodyWeightEntry[] | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.bodyWeightCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as BodyWeightEntry[];
  } catch {
    return null;
  }
}

export async function enqueueBodyWeightOp(op: BodyWeightOp): Promise<void> {
  const db = getOfflineDb();
  const sort = await nextSort();
  await db.bodyWeightQueue.add({
    id: crypto.randomUUID(),
    sort,
    opJson: JSON.stringify(op),
  });
}

export async function listBodyWeightQueue(): Promise<
  Array<{ id: string; sort: number; op: BodyWeightOp }>
> {
  const db = getOfflineDb();
  const rows = await db.bodyWeightQueue.orderBy("sort").toArray();
  return rows.map((r) => ({
    id: r.id,
    sort: r.sort,
    op: JSON.parse(r.opJson) as BodyWeightOp,
  }));
}

export async function removeBodyWeightQueueEntries(ids: string[]): Promise<void> {
  const db = getOfflineDb();
  await db.bodyWeightQueue.bulkDelete(ids);
}

export async function bodyWeightQueueCount(): Promise<number> {
  const db = tryGetOfflineDb();
  if (!db) return 0;
  return db.bodyWeightQueue.count();
}

/** Apply a queued op to the local cache so the UI stays consistent. */
export async function applyOpToCache(op: BodyWeightOp): Promise<void> {
  const entries = (await loadBodyWeightCache()) ?? [];
  let updated: BodyWeightEntry[];

  switch (op.t) {
    case "post": {
      const existing = entries.findIndex((e) => e.date === op.date);
      const entry: BodyWeightEntry = {
        id: op.id,
        weight: op.weight,
        date: op.date,
        notes: op.notes ?? null,
      };
      if (existing >= 0) {
        updated = entries.map((e, i) => (i === existing ? entry : e));
      } else {
        updated = [entry, ...entries];
      }
      break;
    }
    case "patch": {
      updated = entries.map((e) =>
        e.id === op.id
          ? { ...e, weight: op.weight, notes: op.notes ?? e.notes }
          : e
      );
      break;
    }
    case "delete": {
      updated = entries.filter((e) => e.id !== op.id);
      break;
    }
  }

  await saveBodyWeightCache(updated);
}

import {
  listBodyWeightQueue,
  removeBodyWeightQueueEntries,
} from "./body-weight-offline-store";

/**
 * Replays queued body-weight mutations against the API.
 * Call only when `navigator.onLine`.
 */
export async function flushBodyWeightQueue(): Promise<{
  ok: boolean;
  flushed: number;
  error?: string;
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, flushed: 0, error: "offline" };
  }

  const q = await listBodyWeightQueue();
  if (q.length === 0) return { ok: true, flushed: 0 };

  const api = (path: string, init?: RequestInit) =>
    fetch(path, { ...init, credentials: "include" });

  const toDelete: string[] = [];

  try {
    for (const row of q) {
      const op = row.op;
      switch (op.t) {
        case "post": {
          const res = await api("/api/body-weight", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: op.date,
              weight: op.weight,
              notes: op.notes || undefined,
            }),
          });
          if (!res.ok) throw new Error(`post_bw ${res.status}`);
          toDelete.push(row.id);
          break;
        }
        case "patch": {
          const res = await api(`/api/body-weight/${op.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              weight: op.weight,
              notes: op.notes,
            }),
          });
          // 404 means the entry was created offline and its client UUID is unknown to the
          // server — the matching "post" op already saved the correct data, so we skip.
          if (!res.ok && res.status !== 404) throw new Error(`patch_bw ${res.status}`);
          toDelete.push(row.id);
          break;
        }
        case "delete": {
          const res = await api(`/api/body-weight/${op.id}`, {
            method: "DELETE",
          });
          // 404 = already gone or client UUID — safe to skip
          if (!res.ok && res.status !== 404) throw new Error(`delete_bw ${res.status}`);
          toDelete.push(row.id);
          break;
        }
      }
    }

    await removeBodyWeightQueueEntries(toDelete);
    return { ok: true, flushed: toDelete.length };
  } catch (e) {
    // Remove successfully flushed entries even on partial failure
    if (toDelete.length > 0) {
      await removeBodyWeightQueueEntries(toDelete);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, flushed: toDelete.length, error: msg };
  }
}

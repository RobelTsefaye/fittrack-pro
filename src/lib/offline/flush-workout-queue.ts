import type { WorkoutData } from "@/features/workouts/workout-types";
import {
  deleteQueueIdMap,
  listQueueForWorkout,
  loadQueueIdMap,
  loadWorkoutSnapshot,
  rekeyWorkoutLocalState,
  removeQueueEntries,
  saveQueueIdMap,
  saveWorkoutSnapshot,
} from "./workout-offline-store";

/**
 * Replays queued mutations against the API (cookies). Call only when `navigator.onLine`.
 *
 * Each op is removed from the queue (and, for post_workout/post_exercise/
 * post_set, its resolved server id persisted) IMMEDIATELY after it succeeds
 * — not batched until the whole run finishes. A transient failure partway
 * through (a genuine network blip, or the "online" event firing just before
 * the radio is actually up) used to leave every earlier-succeeded op still
 * queued, so the next retry replayed them from scratch: a second
 * `post_workout` created a duplicate server-side workout while the first
 * attempt's half-finished one lingered "active" forever, invisible locally.
 * Removing/persisting per-op as it lands means a retry only ever replays
 * what genuinely didn't make it, however many attempts it takes.
 */
export async function flushWorkoutQueue(
  routeWorkoutId: string
): Promise<{ ok: boolean; newServerWorkoutId?: string; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "offline" };
  }

  let currentId = routeWorkoutId;
  const q = await listQueueForWorkout(currentId);
  if (q.length === 0) {
    return { ok: true };
  }

  const snap = await loadWorkoutSnapshot(currentId);
  if (!snap) {
    // A cancelled/deleted workout from an older app version can leave queue
    // rows behind. They cannot be replayed without their snapshot, so prune
    // them as successful housekeeping rather than showing a toast forever.
    await removeQueueEntries(q.map((row) => row.id));
    await deleteQueueIdMap(currentId);
    return { ok: true };
  }

  let serverWorkoutId: string | null = snap.offlineOrigin ? null : currentId;
  const { weMap, setMap } = await loadQueueIdMap(currentId);

  const api = (path: string, init?: RequestInit) =>
    fetch(path, { ...init, credentials: "include" });

  try {
    for (const row of q) {
      const op = row.op;
      switch (op.t) {
        case "post_workout": {
          const res = await api("/api/workouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: op.name ?? undefined, planSessionId: op.planSessionId ?? undefined }),
          });
          if (!res.ok) throw new Error(`post_workout ${res.status}`);
          const json = (await res.json()) as { data?: { id: string } };
          const newId = json.data?.id ?? null;
          if (!newId) throw new Error("no_workout_id");
          serverWorkoutId = newId;
          // Rekey queue, id mappings, and snapshot as one IndexedDB
          // transaction, including removal of the now-completed POST. The
          // new snapshot is committed before the old one is removed, so a
          // termination cannot create an orphaned queue or lose the POST.
          await rekeyWorkoutLocalState(currentId, newId, snap.data, weMap, setMap, row.id);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("fittrack-workout-rekeyed", {
              detail: { routeId: currentId, serverWorkoutId: newId },
            }));
          }
          currentId = newId;
          break;
        }
        case "patch_workout": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const res = await api(`/api/workouts/${serverWorkoutId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: op.name }),
          });
          if (!res.ok) throw new Error(`patch_workout ${res.status}`);
          await removeQueueEntries([row.id]);
          break;
        }
        case "post_exercise": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const res = await api(`/api/workouts/${serverWorkoutId}/exercises`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exerciseId: op.exerciseId }),
          });
          if (!res.ok) throw new Error(`post_exercise ${res.status}`);
          const json = (await res.json()) as { data?: { id: string } };
          const wid = json.data?.id;
          if (!wid) throw new Error("no_we_id");
          weMap.set(op.clientWeId, wid);
          await removeQueueEntries([row.id]);
          await saveQueueIdMap(currentId, weMap, setMap);
          break;
        }
        case "post_set": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const serverWe = weMap.get(op.clientWeId) ?? op.clientWeId;
          const res = await api(`/api/workouts/${serverWorkoutId}/exercises/${serverWe}/sets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(op.isWarmup ? { isWarmup: true } : {}),
          });
          if (!res.ok) throw new Error(`post_set ${res.status}`);
          const json = (await res.json()) as { data?: { set?: { id: string } } };
          const sid = json.data?.set?.id;
          if (!sid) throw new Error("no_set_id");
          setMap.set(op.clientSetId, sid);
          await removeQueueEntries([row.id]);
          await saveQueueIdMap(currentId, weMap, setMap);
          break;
        }
        case "patch_set": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const serverSetId = setMap.get(op.clientSetId) ?? op.clientSetId;
          const res = await api(`/api/workouts/${serverWorkoutId}/sets/${serverSetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(op.body),
          });
          if (!res.ok) throw new Error(`patch_set ${res.status}`);
          const json = (await res.json()) as { personalRecord?: boolean };
          if (json.personalRecord && typeof window !== "undefined") {
            window.dispatchEvent(new Event("fittrack-set-pr-synced"));
          }
          await removeQueueEntries([row.id]);
          break;
        }
        case "delete_set": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const serverSetId = setMap.get(op.clientSetId) ?? op.clientSetId;
          const res = await api(`/api/workouts/${serverWorkoutId}/sets/${serverSetId}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(`delete_set ${res.status}`);
          await removeQueueEntries([row.id]);
          break;
        }
        case "delete_we": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const serverWe = weMap.get(op.clientWeId) ?? op.clientWeId;
          const res = await api(`/api/workouts/${serverWorkoutId}/exercises/${serverWe}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(`delete_we ${res.status}`);
          await removeQueueEntries([row.id]);
          break;
        }
        case "set_superset_group": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const serverWe = weMap.get(op.clientWeId) ?? op.clientWeId;
          const res = await api(`/api/workouts/${serverWorkoutId}/exercises/${serverWe}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ supersetGroup: op.group }),
          });
          if (!res.ok) throw new Error(`set_superset_group ${res.status}`);
          await removeQueueEntries([row.id]);
          break;
        }
        case "complete_workout": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const res = await api(`/api/workouts/${serverWorkoutId}/complete`, { method: "POST" });
          if (!res.ok && res.status !== 404) throw new Error(`complete_workout ${res.status}`);
          const json = res.ok ? (await res.json()) as {
            comparison?: unknown; newPersonalRecords?: number;
          } : undefined;
          if (json && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("fittrack-workout-complete-synced", {
              detail: { comparison: json.comparison, newPersonalRecords: json.newPersonalRecords },
            }));
          }
          await removeQueueEntries([row.id]);
          break;
        }
        default:
          throw new Error("unknown_op");
      }
    }

    if (!serverWorkoutId) throw new Error("no_server_workout");

    await deleteQueueIdMap(currentId);

    const fres = await fetch(`/api/workouts/${serverWorkoutId}`, { credentials: "include" });
    if (fres.ok) {
      const j = (await fres.json()) as { data: WorkoutData };
      // Never let a stale server read overwrite mutations enqueued while the
      // queue was draining.
      if ((await listQueueForWorkout(serverWorkoutId)).length === 0) {
        await saveWorkoutSnapshot(serverWorkoutId, j.data, false);
      }
    }

    const newServerWorkoutId =
      snap.offlineOrigin && serverWorkoutId !== routeWorkoutId ? serverWorkoutId : undefined;

    return { ok: true, newServerWorkoutId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Even on failure, if `post_workout` already resolved and renamed things
    // this run, tell the caller — its in-memory tracking (e.g. which
    // routeId `/workouts/new`'s mount effect is watching) should follow the
    // rename immediately rather than waiting for a fully successful retry.
    const newServerWorkoutId =
      snap.offlineOrigin && currentId !== routeWorkoutId ? currentId : undefined;
    return { ok: false, error: msg, newServerWorkoutId };
  }
}

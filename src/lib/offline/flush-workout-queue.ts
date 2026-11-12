import type { WorkoutData } from "@/features/workouts/workout-types";
import {
  adoptAliasQueues,
  deleteAliasesOf,
  deleteQueueIdMap,
  deleteWorkoutSnapshot,
  listQueueForWorkout,
  loadQueueIdMap,
  loadWorkoutSnapshot,
  moveQueueEntries,
  rekeyWorkoutLocalState,
  removeQueueEntries,
  resolveWorkoutAlias,
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
const MAX_ROUNDS = 20;

export async function flushWorkoutQueue(
  routeWorkoutId: string,
  // Internal: set on the recursive call that follows an alias. The screen may
  // still be open under the OLD id and keep enqueuing, so the id map of the
  // target and the alias rows must stay until a later regular flush.
  opts: { viaAlias?: boolean } = {}
): Promise<{ ok: boolean; newServerWorkoutId?: string; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "offline" };
  }

  let currentId = routeWorkoutId;

  // An alias of this id wins over any snapshot: the UI recreates a snapshot
  // under the OLD id on every enqueue, so "has a snapshot" does not mean the
  // id was not rekeyed. Hang the ops onto the server id and drop the ghost
  // snapshot (it would show up as an offline-origin workout in the list).
  const alias = await resolveWorkoutAlias(currentId);
  if (alias && alias !== currentId) {
    const pending = await listQueueForWorkout(currentId);
    if (pending.length > 0) {
      await moveQueueEntries(currentId, alias);
      await deleteWorkoutSnapshot(currentId);
      const aliased = await flushWorkoutQueue(alias, { viaAlias: true });
      return { ...aliased, newServerWorkoutId: aliased.newServerWorkoutId ?? alias };
    }
  }

  // Regular flush: take over ops still waiting under alias ids of this id, so
  // the id map below is not deleted while they need it (flushAllQueues visits
  // ids in arbitrary order).
  if (!opts.viaAlias) await adoptAliasQueues(currentId);

  const q = await listQueueForWorkout(currentId);
  if (q.length === 0) {
    // Nothing waiting: clean up leftovers of an earlier alias flush, but never
    // the alias row of an id that was itself rekeyed.
    if (!opts.viaAlias && !alias) {
      await deleteQueueIdMap(currentId);
      await deleteAliasesOf(currentId);
    }
    return { ok: true };
  }

  const snap = await loadWorkoutSnapshot(currentId);
  if (!snap) {
    // No snapshot and no alias: the rows cannot be replayed, but they carry
    // the user's data. Never drop them as "success" — keep them queued and
    // report the problem to the caller.
    return { ok: false, error: "no_snapshot" };
  }

  let serverWorkoutId: string | null = snap.offlineOrigin ? null : currentId;
  const { weMap, setMap } = await loadQueueIdMap(currentId);

  const api = (path: string, init?: RequestInit) =>
    fetch(path, { ...init, credentials: "include" });

  try {
    // Ops can be enqueued while this flush runs (the UI keeps typing), either
    // under the current id or, after the rekey, still under the old route id.
    // Process the initial snapshot of the queue, then re-read until nothing
    // new has arrived, so late ops are neither dropped nor hidden by the
    // final snapshot refresh / id-map deletion below.
    let batch = q;
    for (let round = 0; batch.length > 0 && round < MAX_ROUNDS; round++) {
      for (const row of batch) {
        const op = row.op;
        switch (op.t) {
          case "post_workout": {
            const res = await api("/api/workouts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: op.name ?? undefined }),
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
            // A 404 means the set no longer exists server-side (deleted, or a
            // duplicate that was cleaned up) — nothing left to patch, so treat
            // it the same as success rather than blocking every op queued
            // behind it forever (see complete_workout below for the precedent).
            if (!res.ok && res.status !== 404) throw new Error(`patch_set ${res.status}`);
            await removeQueueEntries([row.id]);
            break;
          }
          case "delete_set": {
            if (!serverWorkoutId) throw new Error("no_server_workout");
            const serverSetId = setMap.get(op.clientSetId) ?? op.clientSetId;
            const res = await api(`/api/workouts/${serverWorkoutId}/sets/${serverSetId}`, {
              method: "DELETE",
            });
            // Already gone is the desired end state for a delete — tolerate it.
            if (!res.ok && res.status !== 404) throw new Error(`delete_set ${res.status}`);
            await removeQueueEntries([row.id]);
            break;
          }
          case "delete_we": {
            if (!serverWorkoutId) throw new Error("no_server_workout");
            const serverWe = weMap.get(op.clientWeId) ?? op.clientWeId;
            const res = await api(`/api/workouts/${serverWorkoutId}/exercises/${serverWe}`, {
              method: "DELETE",
            });
            // Already gone (e.g. the DELETE was applied before a timeout) is the
            // desired end state — tolerate it like delete_set.
            if (!res.ok && res.status !== 404) throw new Error(`delete_we ${res.status}`);
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
            await removeQueueEntries([row.id]);
            break;
          }
          default:
            throw new Error("unknown_op");
        }
      }
      if (currentId !== routeWorkoutId) {
        await moveQueueEntries(routeWorkoutId, currentId);
      }
      batch = await listQueueForWorkout(currentId);
    }

    // Still producing ops after MAX_ROUNDS: keep everything (rows and id map)
    // for the next flush instead of finalizing over unsent ops.
    if (batch.length > 0) throw new Error("queue_busy");

    if (!serverWorkoutId) throw new Error("no_server_workout");

    // After a rekey this run, the UI may still enqueue under the old id until
    // it navigates; those ops are resolved later via the alias and still need
    // the clientId -> serverId maps of the new id. Keep them in that case.
    // A regular flush of the current id means the screen is on it, so alias
    // rows pointing here (and without queued ops) are no longer needed. Not
    // done on the alias path: the old-id screen may still be open there.
    if (currentId === routeWorkoutId && !opts.viaAlias) {
      await deleteQueueIdMap(currentId);
      await deleteAliasesOf(currentId);
    }

    const fres = await fetch(`/api/workouts/${serverWorkoutId}`, { credentials: "include" });
    if (fres.ok) {
      const j = (await fres.json()) as { data: WorkoutData };
      await saveWorkoutSnapshot(serverWorkoutId, j.data, false);
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

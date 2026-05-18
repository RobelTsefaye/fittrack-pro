import type { WorkoutData } from "@/features/workouts/workout-types";
import {
  deleteWorkoutSnapshot,
  listQueueForWorkout,
  loadWorkoutSnapshot,
  removeQueueEntries,
  saveWorkoutSnapshot,
} from "./workout-offline-store";

/**
 * Replays queued mutations against the API (cookies). Call only when `navigator.onLine`.
 */
export async function flushWorkoutQueue(
  routeWorkoutId: string
): Promise<{ ok: boolean; newServerWorkoutId?: string; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "offline" };
  }

  const q = await listQueueForWorkout(routeWorkoutId);
  if (q.length === 0) {
    return { ok: true };
  }

  const snap = await loadWorkoutSnapshot(routeWorkoutId);
  if (!snap) {
    return { ok: false, error: "no_snapshot" };
  }

  const weMap = new Map<string, string>();
  const setMap = new Map<string, string>();
  let serverWorkoutId: string | null = snap.offlineOrigin ? null : routeWorkoutId;
  const queueIdsToDelete: string[] = [];

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
            body: JSON.stringify({ name: op.name ?? undefined }),
          });
          if (!res.ok) throw new Error(`post_workout ${res.status}`);
          const json = (await res.json()) as { data?: { id: string } };
          serverWorkoutId = json.data?.id ?? null;
          if (!serverWorkoutId) throw new Error("no_workout_id");
          queueIdsToDelete.push(row.id);
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
          queueIdsToDelete.push(row.id);
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
          queueIdsToDelete.push(row.id);
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
          queueIdsToDelete.push(row.id);
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
          queueIdsToDelete.push(row.id);
          break;
        }
        case "delete_set": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const serverSetId = setMap.get(op.clientSetId) ?? op.clientSetId;
          const res = await api(`/api/workouts/${serverWorkoutId}/sets/${serverSetId}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(`delete_set ${res.status}`);
          queueIdsToDelete.push(row.id);
          break;
        }
        case "delete_we": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const serverWe = weMap.get(op.clientWeId) ?? op.clientWeId;
          const res = await api(`/api/workouts/${serverWorkoutId}/exercises/${serverWe}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(`delete_we ${res.status}`);
          queueIdsToDelete.push(row.id);
          break;
        }
        case "complete_workout": {
          if (!serverWorkoutId) throw new Error("no_server_workout");
          const res = await api(`/api/workouts/${serverWorkoutId}/complete`, { method: "POST" });
          if (!res.ok && res.status !== 404) throw new Error(`complete_workout ${res.status}`);
          queueIdsToDelete.push(row.id);
          break;
        }
        default:
          throw new Error("unknown_op");
      }
    }

    if (!serverWorkoutId) throw new Error("no_server_workout");

    await removeQueueEntries(queueIdsToDelete);

    const fres = await fetch(`/api/workouts/${serverWorkoutId}`, { credentials: "include" });
    if (fres.ok) {
      const j = (await fres.json()) as { data: WorkoutData };
      await deleteWorkoutSnapshot(routeWorkoutId);
      await saveWorkoutSnapshot(serverWorkoutId, j.data, false);
    }

    const newServerWorkoutId =
      snap.offlineOrigin && serverWorkoutId !== routeWorkoutId ? serverWorkoutId : undefined;

    return { ok: true, newServerWorkoutId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

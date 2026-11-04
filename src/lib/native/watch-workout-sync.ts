"use client";

import {
  pushPlanCatalogToWatch,
  onWatchRequest,
  syncActiveWorkoutToWatch,
  clearWatchWorkoutState,
  syncRecoveryToWatch,
  toWatchWorkoutPayload,
} from "@/lib/native/watch-connectivity";
import type { WorkoutData } from "@/features/workouts/workout-types";
import type { PreviousLogEntry } from "@/features/workouts/previous-logs-types";
import { syncHealthKitData } from "@/lib/native/healthkit";
import { Capacitor } from "@capacitor/core";
import type { RecoveryBreakdown } from "@/features/health/recovery";

/**
 * Backs the Watch's standalone strength-training flow (session picker +
 * set logging), driven entirely by request/reply messages from the Watch
 * over WatchConnectivity. The phone acts as a thin proxy to the existing
 * REST API — the Watch never talks to the network directly.
 */

/** Fetches the plan catalog and pushes it to the Watch as one JSON blob.
 *  Also embeds each exercise's last-session working sets (keyed by
 *  exerciseId) so a Watch workout STARTED OFFLINE can still show the
 *  "last time X kg × Y" hint — the offline path has no network to fetch it
 *  later, so it has to ride along with the catalog while online (mirrors the
 *  online `previousLogs` the phone attaches in toWatchWorkoutPayload). */
export async function syncPlanCatalogToWatch(): Promise<void> {
  try {
    const plansRes = await fetch("/api/plans");
    if (!plansRes.ok) return;
    const { data: plans } = (await plansRes.json()) as { data: Array<{ id: string }> };

    const fullPlans = await Promise.all(
      plans.map(async (plan) => {
        const res = await fetch(`/api/plans/${plan.id}`);
        if (!res.ok) return null;
        const { data } = (await res.json()) as { data: unknown };
        return data;
      })
    );

    // Best-effort — if this fails the Watch simply falls back to no hint
    // offline (same as before), so never let it block the catalog push.
    let previousLogs: Record<string, PreviousLogEntry> | undefined;
    try {
      const prevRes = await fetch("/api/workouts/previous-logs-all");
      if (prevRes.ok) {
        const json = (await prevRes.json()) as { data: Record<string, PreviousLogEntry> };
        previousLogs = json.data;
      }
    } catch {
      // Non-fatal.
    }

    await pushPlanCatalogToWatch({ plans: fullPlans.filter(Boolean), previousLogs });
  } catch {
    // Non-fatal — the Watch just keeps whichever catalog it last received.
  }
}

/** Registers the handler for Watch → phone requests. Call once on app start. */
export function registerWatchWorkoutRequestHandler(): void {
  onWatchRequest(handleWatchRequest);
}

/**
 * Last-session sets per exercise for the workouts the Watch is logging.
 * Every re-push after a logged set must carry them again — otherwise the
 * Watch loses its "last time" hint and the progression suggestion for all
 * remaining sets the moment the first one is logged (the native proxy
 * re-fetches them each time; this JS path used to drop them).
 */
const previousLogsByWorkout = new Map<string, Record<string, PreviousLogEntry>>();

async function previousLogsFor(workoutId: string): Promise<Record<string, PreviousLogEntry> | undefined> {
  const cached = previousLogsByWorkout.get(workoutId);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/workouts/${workoutId}/previous-logs`);
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data: Record<string, PreviousLogEntry> };
    previousLogsByWorkout.set(workoutId, json.data);
    return json.data;
  } catch {
    // Non-fatal: the Watch falls back to its own defaults.
    return undefined;
  }
}

/** Fetches the workout and pushes it (with hints) to the Watch; returns the JSON for a direct reply. */
async function pushWorkoutToWatch(workoutId: string): Promise<string | undefined> {
  const detailRes = await fetch(`/api/workouts/${workoutId}`);
  if (!detailRes.ok) return undefined;
  const { data: workout } = (await detailRes.json()) as { data: WorkoutData };
  const previousLogs = await previousLogsFor(workoutId);
  await syncActiveWorkoutToWatch(workout, previousLogs);
  return JSON.stringify(toWatchWorkoutPayload(workout, previousLogs));
}

async function handleWatchRequest(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const type = message.type as string | undefined;

  switch (type) {
    case "startSession": {
      const sessionId = message.sessionId as string;
      const res = await fetch(`/api/plan-sessions/${sessionId}/start`, { method: "POST" });
      if (!res.ok) return { error: `Start fehlgeschlagen (${res.status})` };
      const { data } = (await res.json()) as { data: { id: string } };

      // Deliver the workout via application context (inside
      // pushWorkoutToWatch), not only the sendMessage reply: two sequential
      // network round-trips (start + detail fetch) are slow enough over a
      // real network that WatchConnectivity can silently drop a delayed
      // reply, leaving the Watch spinning forever with no error. The
      // application context has no such timeout — the Watch picks it up via
      // PhoneWorkoutObserver and routes into the logging screen as soon as
      // it arrives. The JSON rides the reply too, for when it is fast.
      const workoutJSON = await pushWorkoutToWatch(data.id);
      if (!workoutJSON) return { error: "Laden fehlgeschlagen" };
      return { started: true, workoutJSON };
    }

    case "addSet": {
      // One more working set for an exercise, same as "+ Satz" on the phone.
      const workoutId = message.workoutId as string;
      const workoutExerciseId = message.workoutExerciseId as string;
      const res = await fetch(`/api/workouts/${workoutId}/exercises/${workoutExerciseId}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return { error: `Satz hinzufügen fehlgeschlagen (${res.status})` };
      const workoutJSON = await pushWorkoutToWatch(workoutId);
      return workoutJSON ? { done: true, workoutJSON } : { done: true };
    }

    case "logSet": {
      const workoutId = message.workoutId as string;
      const setId = message.setId as string;
      const weight = message.weight as number | undefined;
      const reps = message.reps as number | undefined;
      const res = await fetch(`/api/workouts/${workoutId}/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight, reps, isCompleted: true }),
      });
      if (!res.ok) return { error: `Speichern fehlgeschlagen (${res.status})` };
      const json = (await res.json()) as { data: unknown; personalRecord: boolean };
      const workoutJSON = await pushWorkoutToWatch(workoutId);
      if (!workoutJSON) return { set: json.data, personalRecord: json.personalRecord };
      return { set: json.data, personalRecord: json.personalRecord, workoutJSON };
    }

    case "adjustRestTimer": {
      // See rest-timer-adjust route — persists the Watch's own +/-15s nudge
      // server-side so the phone bar and Live Activity pick it up too,
      // instead of it staying a Watch-only local overlay.
      const workoutId = message.workoutId as string;
      const deltaSeconds = message.deltaSeconds as number;
      const res = await fetch(`/api/workouts/${workoutId}/rest-timer-adjust`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deltaSeconds }),
      });
      if (!res.ok) return { error: `Anpassen fehlgeschlagen (${res.status})` };
      await pushWorkoutToWatch(workoutId);
      return { done: true };
    }

    case "finishWorkout": {
      const workoutId = message.workoutId as string;
      previousLogsByWorkout.delete(workoutId);
      // Ack immediately instead of waiting for the complete-request +
      // context-clear round trip to finish: the same request/reply timing
      // issue that made startSession unreliable (see above) applies here
      // too, and the Watch doesn't actually need this reply for anything —
      // it leaves KraftLoggingView the moment the application-context push
      // clears phoneObserver.activeWorkout, independent of whether this
      // reply arrives at all.
      void (async () => {
        try {
          const res = await fetch(`/api/workouts/${workoutId}/complete`, { method: "POST" });
          if (res.ok) await clearWatchWorkoutState(workoutId);
        } catch {
          // Network hiccup — the Watch already left the workout on its side;
          // the phone stays authoritative and will reconcile on next open.
        }
      })();
      return { started: true };
    }

    case "cancelWorkout": {
      const workoutId = message.workoutId as string;
      previousLogsByWorkout.delete(workoutId);
      void (async () => {
        try {
          const res = await fetch(`/api/workouts/${workoutId}`, { method: "DELETE" });
          if (res.ok) await clearWatchWorkoutState(workoutId);
        } catch {
          // As above — non-fatal, don't leave an unhandled rejection.
        }
      })();
      return { started: true };
    }

    case "refreshRecovery": {
      // Same as the manual refresh button in health-dashboard.tsx: pull the
      // latest vitals from HealthKit first (native only — no-ops on
      // web/Simulator) so the recomputed score actually reflects anything
      // recorded since the last sync, then recompute from the DB.
      if (Capacitor.isNativePlatform()) {
        try {
          await syncHealthKitData();
        } catch {
          // Non-fatal — fall through and recompute from whatever's already
          // in the DB rather than failing the whole refresh.
        }
      }
      const res = await fetch("/api/health/recovery");
      if (!res.ok) return { error: `Recovery-Abruf fehlgeschlagen (${res.status})` };
      const { data } = (await res.json()) as { data: RecoveryBreakdown };
      // Push through the normal application-context channel too (in case the
      // Watch app isn't the one that's currently in the foreground) and hand
      // it back directly in the reply so the Watch shows it immediately
      // without waiting for that separate push to land.
      if (data.level !== "none") await syncRecoveryToWatch(data.score, data.level);
      return { score: data.score, level: data.level };
    }

    default:
      return { error: `Unbekannter Request-Typ: ${type ?? "?"}` };
  }
}

"use client";

import {
  pushPlanCatalogToWatch,
  onWatchRequest,
  syncActiveWorkoutToWatch,
  clearWatchWorkoutState,
  syncRecoveryToWatch,
} from "@/lib/native/watch-connectivity";
import type { WorkoutData } from "@/features/workouts/workout-types";
import type { PreviousLogEntry } from "@/app/api/workouts/[id]/previous-logs/route";
import { syncHealthKitData } from "@/lib/native/healthkit";
import { Capacitor } from "@capacitor/core";
import type { RecoveryBreakdown } from "@/features/health/recovery";

/**
 * Backs the Watch's standalone strength-training flow (session picker +
 * set logging), driven entirely by request/reply messages from the Watch
 * over WatchConnectivity. The phone acts as a thin proxy to the existing
 * REST API — the Watch never talks to the network directly.
 */

/** Fetches the plan catalog and pushes it to the Watch as one JSON blob. */
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

    await pushPlanCatalogToWatch({ plans: fullPlans.filter(Boolean) });
  } catch {
    // Non-fatal — the Watch just keeps whichever catalog it last received.
  }
}

/** Registers the handler for Watch → phone requests. Call once on app start. */
export function registerWatchWorkoutRequestHandler(): void {
  onWatchRequest(handleWatchRequest);
}

async function handleWatchRequest(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const type = message.type as string | undefined;

  switch (type) {
    case "startSession": {
      const sessionId = message.sessionId as string;
      const res = await fetch(`/api/plan-sessions/${sessionId}/start`, { method: "POST" });
      if (!res.ok) return { error: `Start fehlgeschlagen (${res.status})` };
      const { data } = (await res.json()) as { data: { id: string } };

      const detailRes = await fetch(`/api/workouts/${data.id}`);
      if (!detailRes.ok) return { error: `Laden fehlgeschlagen (${detailRes.status})` };
      const { data: workout } = (await detailRes.json()) as { data: WorkoutData };

      // Best-effort — a freshly started session usually has no prior
      // sessions with this exact combination of exercises yet, so a failure
      // here just means the Watch falls back to its own defaults.
      let previousLogs: Record<string, PreviousLogEntry> | undefined;
      try {
        const prevRes = await fetch(`/api/workouts/${data.id}/previous-logs`);
        if (prevRes.ok) {
          const json = (await prevRes.json()) as { data: Record<string, PreviousLogEntry> };
          previousLogs = json.data;
        }
      } catch {
        // Non-fatal.
      }

      // Deliver the workout via application context, not the sendMessage
      // reply: two sequential network round-trips (start + detail fetch)
      // are slow enough over a real network that WatchConnectivity can
      // silently drop a delayed reply, leaving the Watch spinning forever
      // with no error. application context has no such timeout — the Watch
      // picks it up via PhoneWorkoutObserver and ContentView routes into
      // KraftLoggingView as soon as it arrives.
      await syncActiveWorkoutToWatch(workout, previousLogs);
      return { started: true };
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
      return { set: json.data, personalRecord: json.personalRecord };
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
      const detailRes = await fetch(`/api/workouts/${workoutId}`);
      if (detailRes.ok) {
        const { data: workout } = (await detailRes.json()) as { data: WorkoutData };
        await syncActiveWorkoutToWatch(workout);
      }
      return { done: true };
    }

    case "finishWorkout": {
      const workoutId = message.workoutId as string;
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

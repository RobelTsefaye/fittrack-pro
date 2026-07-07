"use client";

import {
  pushPlanCatalogToWatch,
  onWatchRequest,
  syncActiveWorkoutToWatch,
  clearWatchWorkoutState,
} from "@/lib/native/watch-connectivity";
import type { WorkoutData } from "@/features/workouts/workout-types";

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

      // Deliver the workout via application context, not the sendMessage
      // reply: two sequential network round-trips (start + detail fetch)
      // are slow enough over a real network that WatchConnectivity can
      // silently drop a delayed reply, leaving the Watch spinning forever
      // with no error. application context has no such timeout — the Watch
      // picks it up via PhoneWorkoutObserver and ContentView routes into
      // KraftLoggingView as soon as it arrives.
      await syncActiveWorkoutToWatch(workout);
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
          if (res.ok) await clearWatchWorkoutState();
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
          if (res.ok) await clearWatchWorkoutState();
        } catch {
          // As above — non-fatal, don't leave an unhandled rejection.
        }
      })();
      return { started: true };
    }

    default:
      return { error: `Unbekannter Request-Typ: ${type ?? "?"}` };
  }
}

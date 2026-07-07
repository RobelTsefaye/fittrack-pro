"use client";

import { pushPlanCatalogToWatch, onWatchRequest } from "@/lib/native/watch-connectivity";

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
      const { data: workout } = (await detailRes.json()) as { data: unknown };
      return { workout };
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
      const res = await fetch(`/api/workouts/${workoutId}/complete`, { method: "POST" });
      if (!res.ok) return { error: `Abschließen fehlgeschlagen (${res.status})` };
      const json = (await res.json()) as { newPersonalRecords?: number };
      return { done: true, newPersonalRecords: json.newPersonalRecords ?? 0 };
    }

    default:
      return { error: `Unbekannter Request-Typ: ${type ?? "?"}` };
  }
}

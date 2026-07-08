"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { WorkoutData } from "@/features/workouts/workout-types";
import type { PreviousLogEntry } from "@/app/api/workouts/[id]/previous-logs/route";

interface WatchConnectivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  syncActiveWorkout(options: { workoutJSON: string }): Promise<void>;
  clearWorkoutState(): Promise<void>;
  pushPlanCatalog(options: { catalog: string }): Promise<void>;
  syncRecoverySnapshot(options: { score: number; level: string }): Promise<void>;
  respondToRequest(options: { requestId: string; payload: Record<string, unknown> }): Promise<void>;
  addListener(
    eventName: "watchRequest",
    listenerFunc: (data: { requestId: string; message: Record<string, unknown> }) => void
  ): Promise<{ remove: () => void }>;
}

const WatchConnectivity = registerPlugin<WatchConnectivityPlugin>("WatchConnectivity");

/**
 * Trims a full `WorkoutData` down to the fields the Watch's
 * `WatchActiveWorkout`/`WatchWorkoutExercise`/`WatchSet` Codable structs
 * decode — shared between the phone-initiated sync (workout-detail.tsx) and
 * the Watch-initiated one (watch-workout-sync.ts's `startSession` handler)
 * so both push the exact same shape.
 *
 * `previousLogs` (from `GET /api/workouts/:id/previous-logs`, keyed by
 * exerciseId) is optional and, when given, attaches each not-yet-logged
 * set's last-session weight/reps so the Watch can default to that instead
 * of a hardcoded value — same "previous" data the phone shows as a hint.
 */
export function toWatchWorkoutPayload(
  workout: WorkoutData,
  previousLogs?: Record<string, PreviousLogEntry>,
  restTimerEndsAt?: number | null
) {
  return {
    id: workout.id,
    name: workout.name,
    // Epoch seconds (not ms) the current rest timer ends at, or null/absent
    // when no timer is running. The Watch computes its own countdown from
    // this — self-expiring, so nothing has to explicitly "clear" it later.
    restTimerEndsAt: restTimerEndsAt ?? null,
    workoutExercises: workout.workoutExercises.map((we) => {
      const prevSets = previousLogs?.[we.exercise.id];
      return {
        id: we.id,
        exercise: {
          id: we.exercise.id,
          name: we.exercise.name,
          muscleGroup: we.exercise.muscleGroup,
        },
        sets: we.sets.map((s) => {
          const prev = prevSets?.find((p) => p.setNumber === s.setNumber);
          return {
            id: s.id,
            setNumber: s.setNumber,
            reps: s.reps,
            weight: s.weight,
            isCompleted: s.isCompleted,
            previousWeight: prev?.weight ?? null,
            previousReps: prev?.reps ?? null,
          };
        }),
      };
    }),
  };
}

/**
 * Pushes the full active workout (exercises + sets) to the paired Apple
 * Watch, so the Watch app can jump straight into the same logging UI used
 * for Watch-initiated workouts instead of a separate summary screen.
 * No-ops on web/PWA and on iPhones without a paired Watch (the native plugin
 * checks WCSession.isSupported() itself). Also the reliable channel for
 * "watch started a workout" — `updateApplicationContext` doesn't have the
 * reply-handler timeout risk that made syncing the fresh workout back
 * through the Watch's own `startSession` sendMessage reply unreliable over
 * real network latency; see PhoneWorkoutObserver.swift on the Watch side.
 */
export async function syncActiveWorkoutToWatch(
  workout: WorkoutData,
  previousLogs?: Record<string, PreviousLogEntry>,
  restTimerEndsAt?: number | null
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.syncActiveWorkout({
      workoutJSON: JSON.stringify(toWatchWorkoutPayload(workout, previousLogs, restTimerEndsAt)),
    });
  } catch {
    // Non-fatal — Watch mirroring is a nice-to-have, never block the workout UI on it.
  }
}

export async function clearWatchWorkoutState(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.clearWorkoutState();
  } catch {
    // Non-fatal.
  }
}

/**
 * Pushes the Recovery Score to the Watch's HealthDashboardView. The Watch is
 * a separate device from the phone's home-screen widget/complication (which
 * read a *local* App Group snapshot via SharedDataPlugin) — WatchConnectivity
 * is the only channel that actually crosses the Watch↔iPhone boundary.
 */
export async function syncRecoveryToWatch(score: number, level: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.syncRecoverySnapshot({ score, level });
  } catch {
    // Non-fatal — the Watch dashboard just keeps showing the last value it had.
  }
}

/**
 * Pushes the strength-training plan catalog (plans/sessions/exercises) to
 * the Watch so it can offer a session picker without a network round-trip.
 * `catalog` should already be JSON.stringify'd — application contexts only
 * carry plist-safe values, so we hand the whole thing over as one String.
 */
export async function pushPlanCatalogToWatch(catalog: unknown): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.pushPlanCatalog({ catalog: JSON.stringify(catalog) });
  } catch {
    // Non-fatal — the Watch simply won't have an up-to-date catalog until the next push.
  }
}

/**
 * Subscribes to Watch → phone requests (startSession/logSet/finishWorkout),
 * sent via WCSession.sendMessage. `handler` receives the raw message and
 * must return the payload to reply with; errors are caught and returned as
 * `{ error: message }` so the Watch side always gets a reply.
 */
export function onWatchRequest(
  handler: (message: Record<string, unknown>) => Promise<Record<string, unknown>>
): void {
  if (!Capacitor.isNativePlatform()) return;
  WatchConnectivity.addListener("watchRequest", async ({ requestId, message }) => {
    let payload: Record<string, unknown>;
    try {
      payload = await handler(message);
    } catch (error) {
      payload = { error: error instanceof Error ? error.message : "Unknown error" };
    }
    try {
      await WatchConnectivity.respondToRequest({ requestId, payload });
    } catch {
      // Non-fatal — the Watch's sendMessage call will simply time out.
    }
  });
}

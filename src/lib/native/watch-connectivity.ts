"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { WorkoutData } from "@/features/workouts/workout-types";
import { shouldRestAfterExercise } from "@/features/workouts/superset-utils";
import type { PreviousLogEntry } from "@/features/workouts/previous-logs-types";
import { DEFAULT_REST_TIMER } from "@/lib/constants";

/** Also covers the cardio-remote-control methods (see cardio-connectivity.ts)
 *  — one native plugin, one `registerPlugin` call. Registering the same
 *  plugin name twice throws at runtime ("already registered"), so
 *  cardio-connectivity.ts imports the single instance below instead of
 *  registering its own. */
export interface WatchConnectivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  syncActiveWorkout(options: { workoutJSON: string }): Promise<void>;
  wakeWatchApp(): Promise<void>;
  clearWorkoutState(options: { workoutId?: string }): Promise<void>;
  pushPlanCatalog(options: { catalog: string }): Promise<void>;
  getPendingOfflineWorkout(): Promise<{ pendingJSON?: string }>;
  getTerminalOfflineWorkouts(): Promise<{ terminalJSON?: string }>;
  updatePendingOfflineWorkout(options: { workoutJSON: string }): Promise<{ pendingJSON: string }>;
  completePendingOfflineWorkout(options: { workoutId: string }): Promise<void>;
  cancelPendingOfflineWorkout(options: { workoutId: string }): Promise<void>;
  forgetWatchOfflineWorkout(options: { workoutId: string }): Promise<void>;
  flushPendingOfflineWorkout(): Promise<{ flushed: boolean; error?: string }>;
  getWorkoutRekeyMap(): Promise<{ rekeyMapJSON?: string }>;
  syncRecoverySnapshot(options: { score: number; level: string }): Promise<void>;
  respondToRequest(options: { requestId: string; payload: Record<string, unknown> }): Promise<void>;
  startCardioSession(options: {
    activityType: "running" | "cycling" | "elliptical" | "walking";
    isIndoor: boolean;
    durationMinutes?: number;
    targetZone?: number;
    stepGoal?: number;
  }): Promise<{ started: true }>;
  stopCardioSession(options: { discard: boolean }): Promise<{ done: true }>;
  addListener(
    eventName: "watchRequest",
    listenerFunc: (data: { requestId: string; message: Record<string, unknown> }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "watchCardioSaved",
    listenerFunc: () => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "watchWorkoutEnded",
    listenerFunc: (data: { workoutId?: string }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "watchWorkoutSynced",
    listenerFunc: (data: { localId: string; serverWorkoutId: string }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "cardioLiveUpdate",
    listenerFunc: (data: {
      isRunning: boolean;
      heartRate: number;
      activeCalories: number;
      elapsedSeconds: number;
      zone?: number;
      targetZone?: number;
      durationSeconds?: number;
      stepCount?: number;
      stepGoal?: number;
    }) => void
  ): Promise<{ remove: () => void }>;
}

export const WatchConnectivity = registerPlugin<WatchConnectivityPlugin>("WatchConnectivity");

/**
 * Epoch seconds the rest timer should end at — derived purely from data
 * already in `workout` (most recent set completion, or the workout's own
 * start if nothing's completed yet), never from client-tracked state.
 *
 * This used to be a ref the caller maintained locally and passed in, but
 * that meant two independent writers (this web app's own poll, and the
 * Watch's native no-phone-open path) could each push a stale cached value
 * and stomp on whichever one was actually more recent — on the Watch, the
 * rest timer would sometimes silently revert to an old countdown instead of
 * resetting on a fresh set. Deriving it from `completedAt`/`startedAt` — a
 * pure function of already-authoritative server data — is race-free by
 * construction: whoever completed the *actual* latest set gets the same
 * answer regardless of which device asks, and it's non-nil from the moment
 * the workout starts (a set doesn't have to be completed first).
 */
export function computeRestTimerEndsAt(workout: WorkoutData): number | null {
  let anchor = new Date(workout.startedAt).getTime();
  let latestWorkoutExerciseId: string | null = null;
  for (const we of workout.workoutExercises) {
    for (const s of we.sets) {
      if (!s.completedAt) continue;
      const t = new Date(s.completedAt).getTime();
      if (t > anchor) {
        anchor = t;
        latestWorkoutExerciseId = we.id;
      }
    }
  }
  if (latestWorkoutExerciseId && !shouldRestAfterExercise(workout, latestWorkoutExerciseId)) {
    return null;
  }
  return (
    anchor / 1000 +
    (workout.restTimerDefaultSeconds ?? DEFAULT_REST_TIMER) +
    (workout.restTimerAdjustSeconds ?? 0)
  );
}

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
  previousLogs?: Record<string, PreviousLogEntry>
) {
  return {
    id: workout.id,
    name: workout.name,
    // ISO string — the Watch parses this and uses it as the base for its
    // own elapsed-time display instead of "whenever the Watch's own
    // HKWorkoutSession happened to start collecting," which lagged the
    // phone's timer by however long the create-workout -> WatchConnectivity
    // push -> HealthKit authorization chain took (a few seconds, visibly
    // out of sync between the two screens).
    startedAt: workout.startedAt,
    // Self-expiring (compare against "now" on the Watch), so nothing has to
    // explicitly "clear" it later — see computeRestTimerEndsAt above.
    restTimerEndsAt: computeRestTimerEndsAt(workout),
    workoutExercises: workout.workoutExercises.map((we) => {
      const prevSets = previousLogs?.[we.exercise.id];
      // Matched by position among working (non-warmup) sets, same as the
      // phone's own hint (workout-detail.tsx's getPreviousHintForSet) — not
      // by raw setNumber, which drifts whenever either session has a warmup
      // set: setNumber then includes gaps that don't line up between
      // sessions, silently attaching one set's history to the next.
      let workingIndex = 0;
      return {
        id: we.id,
        supersetGroup: we.supersetGroup ?? null,
        exercise: {
          id: we.exercise.id,
          name: we.exercise.name,
          muscleGroup: we.exercise.muscleGroup,
        },
        sets: we.sets.map((s) => {
          const prev = s.isWarmup ? undefined : prevSets?.[workingIndex];
          if (!s.isWarmup) workingIndex++;
          return {
            id: s.id,
            setNumber: s.setNumber,
            reps: s.reps,
            weight: s.weight,
            isCompleted: s.isCompleted,
            isWarmup: s.isWarmup,
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
  previousLogs?: Record<string, PreviousLogEntry>
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.syncActiveWorkout({
      workoutJSON: JSON.stringify(toWatchWorkoutPayload(workout, previousLogs)),
    });
  } catch {
    // Non-fatal — Watch mirroring is a nice-to-have, never block the workout UI on it.
  }
}

/** Best-effort wake-up for a phone-initiated strength workout. */
export async function wakeWatchAppForWorkout(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.wakeWatchApp();
  } catch {
    // A Watch may be unpaired or HealthKit permission denied; phone logging
    // must remain fully usable in either case.
  }
}

export async function clearWatchWorkoutState(workoutId?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.clearWorkoutState({ workoutId });
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

/**
 * Fires when the Watch reports it just saved a cardio HKWorkout and no
 * background-sync token is stored — the native side handles this itself
 * when a token exists (see WatchConnectivityPlugin.didReceiveUserInfo), so
 * this JS fallback only runs with the app open. The handler should push
 * recent HealthKit workouts to the server (syncHealthKitData) so the new
 * session shows up immediately instead of on the next rate-limited sync.
 */
export function onWatchCardioSaved(handler: () => void): void {
  if (!Capacitor.isNativePlatform()) return;
  void WatchConnectivity.addListener("watchCardioSaved", handler);
}

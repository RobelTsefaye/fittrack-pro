"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface WatchConnectivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  updateWorkoutState(options: {
    exerciseName: string;
    currentSet: number;
    totalSets: number;
    weight?: number;
    reps?: number;
  }): Promise<void>;
  clearWorkoutState(): Promise<void>;
  pushPlanCatalog(options: { catalog: string }): Promise<void>;
  respondToRequest(options: { requestId: string; payload: Record<string, unknown> }): Promise<void>;
  addListener(
    eventName: "watchRequest",
    listenerFunc: (data: { requestId: string; message: Record<string, unknown> }) => void
  ): Promise<{ remove: () => void }>;
}

const WatchConnectivity = registerPlugin<WatchConnectivityPlugin>("WatchConnectivity");

/**
 * Pushes the current exercise/set to the paired Apple Watch so the Watch app
 * can mirror "what's happening on the phone" instead of only offering its
 * own standalone workout. No-ops on web/PWA and on iPhones without a paired
 * Watch (the native plugin checks WCSession.isSupported() itself).
 */
export async function updateWatchWorkoutState(state: {
  exerciseName: string;
  currentSet: number;
  totalSets: number;
  weight?: number;
  reps?: number;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WatchConnectivity.updateWorkoutState(state);
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

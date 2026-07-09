"use client";

import { Capacitor } from "@capacitor/core";
import { WatchConnectivity } from "./watch-connectivity";

/**
 * Phone-initiated cardio (Laufen/Radfahren) sessions — the reverse
 * direction of watch-connectivity.ts's Kraft mirroring: here the *phone*
 * tells the Watch to start/stop an HKWorkoutSession and the Watch streams
 * live HR/calories/zone back, since the phone itself has no HR sensor.
 *
 * Uses the *same* registered "WatchConnectivity" plugin instance as
 * watch-connectivity.ts (registering it a second time under this file's own
 * interface throws "already registered" at runtime) — see the doc comment
 * on WatchConnectivityPlugin there for the merged method/listener surface.
 */

export type CardioActivityType = "running" | "cycling";

export type CardioLiveUpdate = {
  isRunning: boolean;
  heartRate: number;
  activeCalories: number;
  elapsedSeconds: number;
  /** Absent when heartRate is below Zone 1's lower bound (resting/no reading yet). */
  zone?: number;
};

/** Thrown by startCardioSessionOnWatch when not running in the native app —
 *  the caller maps this to a localized message via cardio.needsNativeApp. */
export class CardioNotNativeError extends Error {}

/**
 * Starts a cardio session on the paired Watch. Rejects if the Watch isn't
 * reachable or HealthKit refuses — the phone has no fallback data source,
 * so the caller should surface the error rather than showing a live view
 * with no data.
 */
export async function startCardioSessionOnWatch(activityType: CardioActivityType): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new CardioNotNativeError("Not running in the native app");
  }
  await WatchConnectivity.startCardioSession({ activityType });
}

export async function stopCardioSessionOnWatch(discard: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await WatchConnectivity.stopCardioSession({ discard });
}

/** Subscribes to live HR/calories/elapsed/zone pushes while a phone-initiated cardio session runs. */
export function onCardioLiveUpdate(callback: (update: CardioLiveUpdate) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let removed = false;
  let handle: { remove: () => void } | undefined;
  void WatchConnectivity.addListener("cardioLiveUpdate", callback).then((h) => {
    if (removed) {
      h.remove();
    } else {
      handle = h;
    }
  });
  return () => {
    removed = true;
    handle?.remove();
  };
}

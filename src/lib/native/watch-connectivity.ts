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

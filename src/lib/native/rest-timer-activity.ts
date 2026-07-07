"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface RestTimerActivityPlugin {
  start(options: { endsAt: number; title?: string }): Promise<{ id?: string }>;
  update(options: { endsAt?: number; pausedRemainingSeconds?: number }): Promise<void>;
  end(): Promise<void>;
}

const RestTimerActivity = registerPlugin<RestTimerActivityPlugin>("RestTimerActivity");

/**
 * Mirrors the web rest timer (rest-timer-context.tsx) onto a Live Activity /
 * Dynamic Island countdown on native iOS. No-ops entirely on web/PWA where
 * the native plugin isn't registered. All calls swallow errors internally
 * (e.g. iOS <16.1, Live Activities disabled by the user in Settings) — the
 * in-app timer UI is always the source of truth, this is purely a bonus
 * lock-screen mirror.
 */
export async function startRestTimerActivity(endsAt: number, title?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await RestTimerActivity.start({ endsAt, title });
  } catch (err) {
    console.error("[rest-timer-activity] start failed", err);
  }
}

export async function updateRestTimerActivity(options: {
  endsAt?: number;
  pausedRemainingSeconds?: number;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await RestTimerActivity.update(options);
  } catch (err) {
    console.error("[rest-timer-activity] update failed", err);
  }
}

export async function endRestTimerActivity(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await RestTimerActivity.end();
  } catch (err) {
    console.error("[rest-timer-activity] end failed", err);
  }
}

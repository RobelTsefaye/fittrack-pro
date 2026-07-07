"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface RestTimerActivityPlugin {
  start(options: { endsAt: number; title?: string }): Promise<{ id?: string }>;
  update(options: { endsAt?: number; pausedRemainingSeconds?: number }): Promise<void>;
  end(): Promise<void>;
}

const RestTimerActivity = registerPlugin<RestTimerActivityPlugin>("RestTimerActivity");

/**
 * Serializes all native Live-Activity calls. Without this, two rapid
 * `start` calls (e.g. a doubled bridge invocation) can interleave inside the
 * native plugin's "end existing → request new" sequence and leave one
 * orphaned Activity running. Chaining every call guarantees the plugin
 * processes them strictly one after another, so a later `start` always ends
 * the previous Activity before creating its own.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  // Keep the chain alive even if an op rejects; swallow here so one failure
  // doesn't poison every subsequent call.
  queue = run.catch(() => undefined);
  return run;
}

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
  await serialize(async () => {
    try {
      await RestTimerActivity.start({ endsAt, title });
    } catch (err) {
      console.error("[rest-timer-activity] start failed", err);
    }
  });
}

export async function updateRestTimerActivity(options: {
  endsAt?: number;
  pausedRemainingSeconds?: number;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await serialize(async () => {
    try {
      await RestTimerActivity.update(options);
    } catch (err) {
      console.error("[rest-timer-activity] update failed", err);
    }
  });
}

export async function endRestTimerActivity(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await serialize(async () => {
    try {
      await RestTimerActivity.end();
    } catch (err) {
      console.error("[rest-timer-activity] end failed", err);
    }
  });
}

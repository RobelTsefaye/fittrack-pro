"use client";

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** Emitted on app foreground with the running Live Activity's current state,
 *  so the web timer resyncs after -15s/+15s adjustments made from the Dynamic
 *  Island / Lock Screen buttons while backgrounded (see AdjustRestTimerIntent
 *  + RestTimerActivityPlugin.handleAppDidBecomeActive on the native side).
 *  Exactly one of `endsAt` / `pausedRemainingSeconds` is set, matching whether
 *  the timer was running or paused. */
export type RestTimerActivityAdjustment = {
  endsAt?: number;
  pausedRemainingSeconds?: number;
};

interface RestTimerActivityPlugin {
  start(options: { endsAt: number; title?: string }): Promise<{ id?: string }>;
  update(options: { endsAt?: number; pausedRemainingSeconds?: number }): Promise<void>;
  end(): Promise<void>;
  addListener(
    eventName: "adjustment",
    listenerFunc: (data: RestTimerActivityAdjustment) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
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

/**
 * Subscribes to timer adjustments made from the Dynamic Island / Lock Screen
 * +/- buttons. No-ops on web/PWA. Returns an unsubscribe function.
 */
export function onRestTimerActivityAdjustment(
  handler: (adjustment: RestTimerActivityAdjustment) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let cancelled = false;
  const handlePromise = RestTimerActivity.addListener("adjustment", handler);
  handlePromise.catch((err) => {
    console.error("[rest-timer-activity] addListener failed", err);
  });
  return () => {
    if (cancelled) return;
    cancelled = true;
    void handlePromise.then((h) => h.remove()).catch(() => undefined);
  };
}

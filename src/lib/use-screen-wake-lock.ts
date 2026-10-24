"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `enabled` (e.g. during an active workout), so
 * the phone doesn't lock between sets. Browsers drop the lock whenever the
 * page is hidden, so it is re-acquired when the page becomes visible again.
 * Best effort: silently does nothing where the Wake Lock API is missing.
 */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) void next.release();
        else sentinel = next;
      } catch {
        /* denied (e.g. low battery mode) or unsupported — ignore */
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}

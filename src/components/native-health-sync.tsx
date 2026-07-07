"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { requestHealthKitAuthorization, syncHealthKitData } from "@/lib/native/healthkit";

// Avoid re-syncing on every tab-visibility flicker — once every 15 min is
// plenty for daily vitals that only change a few times a day at most.
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Replaces the Health Auto Export / Shortcuts bridge for native-app users:
 * requests HealthKit authorization once logged in, then syncs on mount and
 * every time the app returns to the foreground (visibilitychange fires in
 * the Capacitor WebView same as a browser tab). No-ops entirely on web/PWA.
 */
export function NativeHealthSync() {
  const { status } = useSession();
  const lastSyncRef = useRef(0);
  const authorizedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    async function sync() {
      const now = Date.now();
      if (now - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return;
      lastSyncRef.current = now;

      if (!authorizedRef.current) {
        const granted = await requestHealthKitAuthorization();
        if (!granted) return;
        authorizedRef.current = true;
      }
      const result = await syncHealthKitData();
      if (result.snapshots > 0 || result.workouts > 0) {
        console.log(`[healthkit] synced ${result.snapshots} days, ${result.workouts} workouts`);
      }
    }

    void sync();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void sync();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [status]);

  return null;
}

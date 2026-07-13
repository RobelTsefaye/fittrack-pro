"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { flushAllQueues } from "@/lib/offline/flush-all-queues";
import { WatchConnectivity } from "@/lib/native/watch-connectivity";
import { toast } from "sonner";

export function OfflineSyncProvider() {
  const pathname = usePathname();
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    async function run() {
      if (typeof navigator === "undefined" || !navigator.onLine || busy.current) return;
      busy.current = true;
      try {
        // The Watch-started queue is native/App-Group state, not IndexedDB,
        // so flush it explicitly alongside the web queues. This covers a
        // Wi-Fi connection that regains internet without a new NWPath change.
        if (Capacitor.isNativePlatform()) {
          try {
            await WatchConnectivity.flushPendingOfflineWorkout();
          } catch {
            // The regular queue flush below still runs; native retry is best-effort.
          }
        }
        const { workouts, bodyWeight } = await flushAllQueues();

        for (const { routeId, result } of workouts) {
          if (!result.ok && result.error && result.error !== "offline") {
            toast.error(`Sync failed: ${result.error}`);
          }
          // `newServerWorkoutId` can be set even on a partial failure — the
          // workout itself got created and renamed mid-flush before a LATER
          // op (an exercise/set/complete) failed (see flush-workout-queue.ts).
          // Still navigate away from the old id so the user isn't left
          // looking at a route that's about to stop resolving locally, but
          // only announce full success with the toast.
          if (result.newServerWorkoutId) {
            const prefix = `/workouts/${routeId}`;
            if (
              pathname === prefix ||
              pathname.startsWith(`${prefix}/`) ||
              // Offline workouts render inline on /workouts/new
              pathname === "/workouts/new"
            ) {
              router.replace(`/workouts/${result.newServerWorkoutId}`);
            }
            if (result.ok) toast.success("Offline workout saved to your account.");
          }
        }

        if (bodyWeight.flushed > 0 && bodyWeight.ok) {
          // Notify body weight tracker to reload from server
          window.dispatchEvent(new Event("fittrack-bw-synced"));
        }
        if (!bodyWeight.ok && bodyWeight.error && bodyWeight.error !== "offline") {
          toast.error(`Body weight sync failed: ${bodyWeight.error}`);
        }
      } finally {
        busy.current = false;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("fittrack-offline-synced"));
      }
    }

    void run();

    // Named handler so cleanup actually removes THIS effect's listener —
    // the previous inline arrow was never removed (cleanup mistakenly
    // targeted `run`), so every navigation piled on another leaked
    // "online" listener that kept firing extra syncs forever.
    //
    // Note: this used to also call warmCurrentRoute(pathname) here AND on
    // every pathname change below — on a real (non-localhost) connection
    // that meant every single tab tap fired a WARM_CACHE postMessage that
    // made the service worker independently re-fetch the exact page Next's
    // router was already fetching for the navigation, doubling network
    // traffic per tap. PwaRegister already warms all the important routes
    // once on SW registration and again on every "online" event, so no
    // per-navigation warming is needed here at all.
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);

    // The "online" event alone can be missed while the WKWebView is
    // suspended in the background (connectivity can change during that
    // window with nothing there to hear it) — a genuine background flush of
    // the IndexedDB queue isn't possible at all in that state (no JS
    // running, see BackgroundSyncManager.swift's doc comment for why that's
    // native-only and HealthKit-specific), so this is the next best thing:
    // re-check as soon as the app is foregrounded again. No-ops on web.
    let removeResumeListener: (() => void) | undefined;
    const resumeListenerPromise = CapacitorApp.addListener("resume", () => void run());
    void resumeListenerPromise.then((handle) => {
      removeResumeListener = () => void handle.remove();
    });

    return () => {
      window.removeEventListener("online", onOnline);
      removeResumeListener?.();
    };
  }, [pathname, router]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App as CapacitorApp } from "@capacitor/app";
import { flushAllQueues } from "@/lib/offline/flush-all-queues";
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
        const { workouts, bodyWeight } = await flushAllQueues();

        for (const { routeId, result } of workouts) {
          if (!result.ok && result.error && result.error !== "offline") {
            toast.error(`Sync failed: ${result.error}`);
          }
          if (result.ok && result.newServerWorkoutId) {
            const prefix = `/workouts/${routeId}`;
            if (
              pathname === prefix ||
              pathname.startsWith(`${prefix}/`) ||
              // Offline workouts render inline on /workouts/new
              pathname === "/workouts/new"
            ) {
              router.replace(`/workouts/${result.newServerWorkoutId}`);
            }
            toast.success("Offline workout saved to your account.");
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

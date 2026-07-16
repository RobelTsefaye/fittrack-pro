"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { flushAllQueues } from "@/lib/offline/flush-all-queues";
import { WatchConnectivity } from "@/lib/native/watch-connectivity";
import { workoutHref } from "@/lib/workout-href";
import { toast } from "sonner";
import { scheduleWorkoutFlush } from "@/lib/offline/flush-pump";

export function OfflineSyncProvider() {
  const pathname = usePathname();
  const router = useRouter();
  const busy = useRef(false);

  // A Watch-started offline workout is replayed natively (WatchAPIProxy), so
  // the phone never learns its new server id from flushAllQueues the way an
  // IndexedDB-queued workout does. Without this, a phone view still on the
  // local UUID route (`/workouts/_?id=<localId>`) keeps fetching that id after
  // the native store is cleared and shows "Workout not found". The native
  // bridge emits the local→server mapping the moment replay assigns it; rehang
  // the route onto the server id and refresh any list left mounted.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    void WatchConnectivity.addListener("watchWorkoutSynced", ({ localId, serverWorkoutId }) => {
      const currentId =
        new URLSearchParams(window.location.search).get("id") ??
        window.location.pathname.split("/workouts/")[1]?.split("/")[0];
      if (currentId === localId) {
        router.replace(workoutHref(serverWorkoutId));
      }
      // The native replay can be triggered by NWPathMonitor without going
      // through run() below, so its fittrack-offline-synced never fired —
      // announce it here so the history list picks up the saved workout.
      window.dispatchEvent(new Event("fittrack-offline-synced"));
    }).then((handle) => {
      remove = () => handle.remove();
    });
    return () => remove?.();
  }, [router]);

  // Every IndexedDB workout write announces itself. The pump keeps the UI
  // independent of network latency while replaying shortly afterwards.
  useEffect(() => {
    const queued = (event: Event) => {
      const workoutId = (event as CustomEvent<{ workoutId?: string }>).detail?.workoutId;
      if (workoutId) scheduleWorkoutFlush(workoutId);
    };
    const online = () => {
      void flushAllQueues().then(({ workouts }) => {
        workouts.forEach(({ routeId }) => scheduleWorkoutFlush(routeId, { immediate: true }));
      });
    };
    window.addEventListener("fittrack-workout-op-queued", queued);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("fittrack-workout-op-queued", queued);
      window.removeEventListener("online", online);
    };
  }, []);

  useEffect(() => {
    const rekey = (event: Event) => {
      const { routeId, serverWorkoutId } =
        (event as CustomEvent<{ routeId?: string; serverWorkoutId?: string }>).detail ?? {};
      if (!routeId || !serverWorkoutId) return;
      const onThisWorkout = Capacitor.isNativePlatform()
        ? pathname === "/workouts/_" && new URLSearchParams(window.location.search).get("id") === routeId
        : pathname === `/workouts/${routeId}` || pathname.startsWith(`/workouts/${routeId}/`);
      if (onThisWorkout || pathname === "/workouts/new") router.replace(workoutHref(serverWorkoutId));
    };
    window.addEventListener("fittrack-workout-rekeyed", rekey);
    return () => window.removeEventListener("fittrack-workout-rekeyed", rekey);
  }, [pathname, router]);

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
            const watchResult = await WatchConnectivity.flushPendingOfflineWorkout();
            // Surface a persistently failing Watch sync (e.g. a stuck
            // "SYNC" badge in the Workouts list) instead of silently
            // retrying forever with no diagnostic trail — mirrors the
            // toast the IndexedDB queue flush already shows below.
            if (!watchResult.flushed && watchResult.error) {
              toast.error(`Watch-Sync fehlgeschlagen: ${watchResult.error}`);
            }
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
            // On native, a workout page is always `/workouts/_?id=<routeId>`
            // (see workout-href.ts) — the real route only resolves as a
            // query param, never as a `/workouts/<routeId>` path segment.
            // Comparing against the web-style path here always missed on
            // native, so the redirect below never fired: the page stayed on
            // the now-stale local id, its own "fittrack-offline-synced"
            // listener (workout-detail.tsx) re-fetched that id, and the
            // server correctly said 404 — surfacing "Workout not found" for
            // an offline workout that had in fact synced successfully.
            const prefix = `/workouts/${routeId}`;
            const onThisWorkout = Capacitor.isNativePlatform()
              ? pathname === "/workouts/_" &&
                new URLSearchParams(window.location.search).get("id") === routeId
              : pathname === prefix || pathname.startsWith(`${prefix}/`);
            if (
              onThisWorkout ||
              // Offline workouts render inline on /workouts/new
              pathname === "/workouts/new"
            ) {
              router.replace(workoutHref(result.newServerWorkoutId));
            }
            // The local-first pump also rekeys brand-new online workouts;
            // don't show an "offline saved" toast for each normal start.
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

"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { requestHealthKitAuthorization, syncHealthKitData } from "@/lib/native/healthkit";
import { onWatchCardioSaved } from "@/lib/native/watch-connectivity";

// Avoid re-syncing on every tab-visibility flicker — once every 15 min is
// plenty for daily vitals that only change a few times a day at most.
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const HOURLY_SYNC_INTERVAL_MS = 60 * 60 * 1000;

// Persists "HealthKit authorization already granted" across app relaunches.
// authorizedRef alone used to reset to false on every fresh mount — and the
// WKWebView remounts far more often than a user would expect (iOS evicts
// backgrounded app processes under memory pressure, same mechanism behind
// the rest-timer/session-storage bug), so requestHealthKitAuthorization()
// re-ran on every one of those relaunches. Read once as the ref's initial
// value so a same-day re-request only happens once for a genuinely fresh
// install, not every time the process gets evicted and relaunched.
const AUTHORIZED_STORAGE_KEY = "fittrack-healthkit-authorized";

function readPersistedAuthorized(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(AUTHORIZED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePersistedAuthorized() {
  try {
    localStorage.setItem(AUTHORIZED_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Replaces the Health Auto Export / Shortcuts bridge for native-app users:
 * requests HealthKit authorization once logged in, then syncs on mount and
 * every time the app returns to the foreground.
 *
 * Uses @capacitor/app's 'resume' event as the PRIMARY foreground trigger on
 * native — document.visibilitychange is unreliable inside a Capacitor
 * WKWebView (backgrounding an iOS app doesn't reliably flip
 * document.visibilityState the way switching browser tabs does), so relying
 * on it alone meant re-syncs often only happened on a full cold app launch,
 * leaving steps/calories looking stale for hours. visibilitychange is kept
 * as a fallback for web/PWA, where 'resume' isn't available.
 */
export function NativeHealthSync() {
  const lastSyncRef = useRef(0);
  const authorizedRef = useRef(readPersistedAuthorized());

  useEffect(() => {
    async function sync() {
      const now = Date.now();
      if (now - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return;
      lastSyncRef.current = now;

      if (!authorizedRef.current) {
        const granted = await requestHealthKitAuthorization();
        if (!granted) return;
        authorizedRef.current = true;
        writePersistedAuthorized();
      }
      const result = await syncHealthKitData();
      if (result.snapshots > 0 || result.workouts > 0) {
        console.log(`[healthkit] synced ${result.snapshots} days, ${result.workouts} workouts`);
      }
    }

    void sync();
    const hourlySync = window.setInterval(() => void sync(), HOURLY_SYNC_INTERVAL_MS);

    // Watch just saved a cardio session and no background-sync token is
    // stored (the native side handles it itself otherwise). Bypasses the
    // 15-min rate limit — this is an explicit "new data exists right now"
    // signal, not a speculative visibility flicker. Small delay so the
    // workout has a moment to replicate into the phone's HealthKit store.
    onWatchCardioSaved(() => {
      setTimeout(() => {
        lastSyncRef.current = 0;
        void sync();
      }, 5000);
    });

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void sync();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    let removeResumeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      const listenerPromise = CapacitorApp.addListener("resume", () => void sync());
      void listenerPromise.then((handle) => {
        removeResumeListener = () => void handle.remove();
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(hourlySync);
      removeResumeListener?.();
    };
  }, []);

  return null;
}

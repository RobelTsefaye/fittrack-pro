"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { getCachedToken } from "@/lib/native/auth-token-cache";
import { syncPlanCatalogToWatch, registerWatchWorkoutRequestHandler } from "@/lib/native/watch-workout-sync";

/**
 * Bootstraps the Watch's standalone strength-training flow: registers the
 * request/reply handler once (startSession/logSet/finishWorkout) and keeps
 * the plan catalog on the Watch fresh so the session picker works offline.
 * No-op on web/PWA (Capacitor.isNativePlatform() guards inside the imports).
 *
 * Gated on the actual Bearer token (via getCachedToken()), NOT
 * useSession().status — that cookie-backed session is only best-effort
 * synced on native (see project-docs/offline-first-roadmap.md Phase 2) and
 * can silently die while the token stays valid. Gating on it here meant a
 * user who was fully logged in (everything else in the app working fine)
 * never got their plan catalog pushed to the Watch at all — reported as
 * "the Watch shows no plans to start a workout from." Same root cause
 * already fixed for the dashboard greeting / More-page profile / avatar
 * initials; this was the one remaining call site.
 */
export function NativeWatchWorkoutSync() {
  const [hasToken, setHasToken] = useState(false);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void getCachedToken().then((token) => setHasToken(token != null));
  }, []);

  useEffect(() => {
    if (!hasToken || !Capacitor.isNativePlatform()) return;

    if (!registeredRef.current) {
      registerWatchWorkoutRequestHandler();
      registeredRef.current = true;
    }

    void syncPlanCatalogToWatch();

    const listenerPromise = CapacitorApp.addListener("resume", () => void syncPlanCatalogToWatch());
    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
  }, [hasToken]);

  return null;
}

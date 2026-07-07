"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { syncPlanCatalogToWatch, registerWatchWorkoutRequestHandler } from "@/lib/native/watch-workout-sync";

/**
 * Bootstraps the Watch's standalone strength-training flow: registers the
 * request/reply handler once (startSession/logSet/finishWorkout) and keeps
 * the plan catalog on the Watch fresh so the session picker works offline.
 * No-op on web/PWA (Capacitor.isNativePlatform() guards inside the imports).
 */
export function NativeWatchWorkoutSync() {
  const { status } = useSession();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !Capacitor.isNativePlatform()) return;

    if (!registeredRef.current) {
      registerWatchWorkoutRequestHandler();
      registeredRef.current = true;
    }

    void syncPlanCatalogToWatch();

    const listenerPromise = CapacitorApp.addListener("resume", () => void syncPlanCatalogToWatch());
    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
  }, [status]);

  return null;
}

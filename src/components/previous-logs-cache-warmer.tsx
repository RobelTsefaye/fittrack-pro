"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { getCachedToken } from "@/lib/native/auth-token-cache";
import type { PreviousLogEntry } from "@/features/workouts/previous-logs-types";
import { savePreviousLogsCache } from "@/lib/offline/screen-caches";

/** Opportunistically seeds all prior exercise logs while online, rather than
 * waiting until each exercise happens to appear in an active workout.
 *
 * On native, gated on the actual Bearer token (via getCachedToken()) rather
 * than useSession().status — that cookie-backed session is only
 * best-effort synced on native and can silently die while the token stays
 * valid. Web keeps using the session status. */
export function PreviousLogsCacheWarmer() {
  const { status } = useSession();
  const [nativeReady, setNativeReady] = useState(!Capacitor.isNativePlatform());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void getCachedToken().then((token) => setNativeReady(token != null));
  }, []);

  useEffect(() => {
    const ready = Capacitor.isNativePlatform() ? nativeReady : status === "authenticated";
    if (!ready) return;

    let cancelled = false;
    async function warm() {
      if (typeof navigator === "undefined" || !navigator.onLine) return;
      try {
        const response = await fetch("/api/workouts/previous-logs-all", { credentials: "include" });
        if (!response.ok) return;
        const json = (await response.json()) as { data?: Record<string, PreviousLogEntry> };
        if (!cancelled && json.data) await savePreviousLogsCache(json.data);
      } catch {
        // Offline cache warming is strictly best-effort.
      }
    }

    void warm();
    window.addEventListener("online", warm);
    return () => {
      cancelled = true;
      window.removeEventListener("online", warm);
    };
  }, [status, nativeReady]);

  return null;
}

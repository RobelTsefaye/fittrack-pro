"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onCardioLiveUpdate, type CardioLiveUpdate } from "@/lib/native/cardio-connectivity";

type CardioLiveContextValue = {
  live: CardioLiveUpdate | null;
};

const CardioLiveContext = createContext<CardioLiveContextValue>({ live: null });

/** How often devices without a direct Watch connection (e.g. an iPad — Apple
 *  Watch only ever pairs with an iPhone, never an iPad) poll the server for
 *  the phone's latest pushed sample. Close to the Watch's own ~1s push
 *  cadence so it still reads as "live" without hammering the API. */
const POLL_INTERVAL_MS = 1500;

/**
 * Subscribes to the Watch's live cardio push exactly once, app-wide, AND
 * relays it cross-device via the server. A cardio session can be started
 * directly on the Watch (see ContentView.swift — the push fires for any
 * running Laufen/Radfahren session, not just phone-initiated ones), so the
 * phone needs to learn about it from wherever the user happens to be in the
 * app, not only while /workouts/cardio is open. CardioActiveBanner and the
 * cardio page itself both read this same context instead of each
 * subscribing independently.
 *
 * Only the phone ever receives real native pushes — WatchConnectivity is an
 * iPhone↔Watch pairing, there is no such thing on an iPad. So every sample
 * the phone receives is also POSTed to /api/cardio/live; any other
 * signed-in device (e.g. an iPad running this same app) polls that endpoint
 * to see the same live session, just via a ~1-2s network round trip instead
 * of the phone's instant native path.
 */
export function CardioLiveProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<CardioLiveUpdate | null>(null);
  /** Timestamp of this device's last native sample — while recent, poll
   *  results are ignored so a device *with* a real Watch connection always
   *  prefers its own instant native path over its own slightly-lagged
   *  server round trip. Stays 0 forever on a device with no Watch (e.g. an
   *  iPad), so polling is the only source there. */
  const lastNativeUpdateAt = useRef(0);

  useEffect(() => {
    return onCardioLiveUpdate((update) => {
      lastNativeUpdateAt.current = Date.now();
      setLive(update.isRunning ? update : null);

      void fetch("/api/cardio/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          isRunning: update.isRunning,
          heartRate: update.heartRate,
          activeCalories: update.activeCalories,
          elapsedSeconds: update.elapsedSeconds,
          zone: update.zone,
        }),
      }).catch(() => {
        /* best-effort — this device's own UI already has the update via the
         * native push above; only *other* devices miss out, until the next
         * successful push. */
      });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (Date.now() - lastNativeUpdateAt.current < POLL_INTERVAL_MS) return;
      try {
        const res = await fetch("/api/cardio/live", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const { data } = (await res.json()) as { data: CardioLiveUpdate | null };
        if (!cancelled) setLive(data);
      } catch {
        /* offline / signed out for this tick — the next interval retries */
      }
    }

    const id = setInterval(poll, POLL_INTERVAL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return <CardioLiveContext.Provider value={{ live }}>{children}</CardioLiveContext.Provider>;
}

/** Null when no cardio session is currently active on the Watch. */
export function useCardioLive(): CardioLiveUpdate | null {
  return useContext(CardioLiveContext).live;
}

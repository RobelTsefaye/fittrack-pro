"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onCardioLiveUpdate, type CardioLiveUpdate } from "@/lib/native/cardio-connectivity";

type CardioLiveContextValue = {
  live: CardioLiveUpdate | null;
};

const CardioLiveContext = createContext<CardioLiveContextValue>({ live: null });

// A real Apple Watch can only ever pair with ONE iPhone — WCSession.isSupported()
// is unconditionally false on iPad, so the native push below never fires
// there. Polling GET /api/cardio/live (relayed there by the paired iPhone's
// own POST, below) is how every *other* signed-in device — an iPad, a
// second iPhone — still sees the live view. Faster while something appears
// to be running (so starting a session and switching to another device
// reads as "live"), slower while idle to not hammer the DB with a poll that
// almost always returns null.
const POLL_INTERVAL_ACTIVE_MS = 2_000;
const POLL_INTERVAL_IDLE_MS = 5_000;
// If a native push landed more recently than this, a poll response is
// necessarily older news — skip applying it rather than have the slower
// server round-trip visibly regress the faster native update.
const NATIVE_FRESHNESS_GUARD_MS = 3_000;

/**
 * Subscribes to the Watch's live cardio push exactly once, app-wide. A
 * cardio session can be started directly on the Watch (see ContentView.swift
 * — the push fires for any running Laufen/Radfahren session, not just
 * phone-initiated ones), so the phone needs to learn about it from
 * wherever the user happens to be in the app, not only while
 * /workouts/cardio is open. CardioActiveBanner and the cardio page itself
 * both read this same context instead of each subscribing independently.
 */
export function CardioLiveProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<CardioLiveUpdate | null>(null);
  const lastNativeUpdateAt = useRef(0);

  useEffect(() => {
    return onCardioLiveUpdate((update) => {
      lastNativeUpdateAt.current = Date.now();
      setLive(update.isRunning ? update : null);
      // Fire-and-forget — this is only reachable on the one device actually
      // paired with the Watch, relaying to the server so every other
      // signed-in device can poll it below.
      void fetch("/api/cardio/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(update),
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch("/api/cardio/live", { credentials: "include" });
        if (!cancelled && res.ok && Date.now() - lastNativeUpdateAt.current > NATIVE_FRESHNESS_GUARD_MS) {
          const json = (await res.json()) as { data: CardioLiveUpdate | null };
          setLive(json.data?.isRunning ? json.data : null);
        }
      } catch {
        // Non-fatal — next poll tick retries.
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, live ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS);
        }
      }
    }

    timer = setTimeout(poll, live ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!live]);

  return <CardioLiveContext.Provider value={{ live }}>{children}</CardioLiveContext.Provider>;
}

/** Null when no cardio session is currently active on the Watch. */
export function useCardioLive(): CardioLiveUpdate | null {
  return useContext(CardioLiveContext).live;
}

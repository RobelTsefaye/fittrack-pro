"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onCardioLiveUpdate, type CardioLiveUpdate } from "@/lib/native/cardio-connectivity";

type CardioLiveContextValue = {
  live: CardioLiveUpdate | null;
};

const CardioLiveContext = createContext<CardioLiveContextValue>({ live: null });

// A real Apple Watch can only ever pair with ONE iPhone — WCSession.isSupported()
// is unconditionally false on iPad, so the native push below never fires
// there. GET /api/cardio/live/stream (an SSE stream, fed by the paired
// iPhone's own POST below) is how every *other* signed-in device — an iPad, a
// second iPhone — still sees the live view, pushed within ~300ms of the phone
// rather than waiting for a poll tick.
const STREAM_URL = "/api/cardio/live/stream";
// Safety-net poll: only used if SSE never delivers (a proxy strips the stream,
// or the browser doesn't honor EventSource). Slow on purpose — SSE is the
// real path; this just guarantees the view isn't stuck if SSE is unavailable.
const FALLBACK_POLL_MS = 5_000;
// If SSE delivered within this window, skip a fallback poll — the stream is
// clearly working, no need to also hit the plain GET.
const SSE_FRESHNESS_MS = 8_000;
// If a native push landed more recently than this, a server update (stream or
// poll) is necessarily older news — skip it rather than have the slower
// round-trip visibly regress the faster native update on the paired iPhone.
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
  const lastStreamAt = useRef(0);

  useEffect(() => {
    return onCardioLiveUpdate((update) => {
      lastNativeUpdateAt.current = Date.now();
      setLive(update.isRunning ? update : null);
      // Fire-and-forget — this is only reachable on the one device actually
      // paired with the Watch, relaying to the server so every other
      // signed-in device sees it via the SSE stream / poll below.
      void fetch("/api/cardio/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(update),
      }).catch(() => {});
    });
  }, []);

  // Primary path: SSE. EventSource auto-reconnects (incl. after the server
  // closes the stream at ~50s), and uses the session cookie automatically.
  useEffect(() => {
    let cancelled = false;
    const source = new EventSource(STREAM_URL, { withCredentials: true });

    source.onmessage = (event) => {
      if (cancelled) return;
      lastStreamAt.current = Date.now();
      if (Date.now() - lastNativeUpdateAt.current <= NATIVE_FRESHNESS_GUARD_MS) return;
      try {
        const json = JSON.parse(event.data) as { data: CardioLiveUpdate | null };
        setLive(json.data?.isRunning ? json.data : null);
      } catch {
        // Ignore a malformed frame — the next one supersedes it.
      }
    };

    // On error EventSource reconnects on its own; the fallback poll below
    // covers the case where SSE can't connect at all.

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  // Fallback poll: only acts when SSE hasn't delivered recently, so it's a
  // no-op whenever the stream is healthy.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const sseHealthy = Date.now() - lastStreamAt.current < SSE_FRESHNESS_MS;
      const nativeFresh = Date.now() - lastNativeUpdateAt.current <= NATIVE_FRESHNESS_GUARD_MS;
      if (!sseHealthy && !nativeFresh) {
        try {
          const res = await fetch("/api/cardio/live", { credentials: "include" });
          if (!cancelled && res.ok) {
            const json = (await res.json()) as { data: CardioLiveUpdate | null };
            setLive(json.data?.isRunning ? json.data : null);
          }
        } catch {
          // Non-fatal — next tick retries.
        }
      }
      if (!cancelled) timer = setTimeout(poll, FALLBACK_POLL_MS);
    }

    let timer = setTimeout(poll, FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return <CardioLiveContext.Provider value={{ live }}>{children}</CardioLiveContext.Provider>;
}

/** Null when no cardio session is currently active on the Watch. */
export function useCardioLive(): CardioLiveUpdate | null {
  return useContext(CardioLiveContext).live;
}

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onCardioLiveUpdate, type CardioLiveUpdate } from "@/lib/native/cardio-connectivity";

type CardioLiveContextValue = {
  live: CardioLiveUpdate | null;
};

const CardioLiveContext = createContext<CardioLiveContextValue>({ live: null });

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

  useEffect(() => {
    return onCardioLiveUpdate((update) => {
      setLive(update.isRunning ? update : null);
    });
  }, []);

  return <CardioLiveContext.Provider value={{ live }}>{children}</CardioLiveContext.Provider>;
}

/** Null when no cardio session is currently active on the Watch. */
export function useCardioLive(): CardioLiveUpdate | null {
  return useContext(CardioLiveContext).live;
}

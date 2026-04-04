"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_REST_TIMER } from "@/lib/constants";

export type RestTimerOptions = {
  /** Called once when countdown reaches zero naturally. */
  onExpire?: () => void;
};

export function useRestTimer(defaultDuration = DEFAULT_REST_TIMER, options?: RestTimerOptions) {
  const onExpireRef = useRef(options?.onExpire);
  onExpireRef.current = options?.onExpire;

  const [isRestActive, setIsRestActive] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [remaining, setRemaining] = useState(defaultDuration);
  const [duration, setDuration] = useState(defaultDuration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          queueMicrotask(() => onExpireRef.current?.());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const start = useCallback(
    (seconds?: number) => {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      const d = seconds ?? defaultDuration;
      setDuration(d);
      setRemaining(d);
      setIsRunning(true);
      setIsRestActive(true);
    },
    [defaultDuration]
  );

  const stop = useCallback(() => {
    setIsRunning(false);
    setIsRestActive(false);
    setRemaining(defaultDuration);
    setDuration(defaultDuration);
  }, [defaultDuration]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (remainingRef.current > 0) setIsRunning(true);
  }, []);

  /** Positive: extend rest (more time left, lengthen total). Negative: skip ahead. */
  const adjustTime = useCallback((delta: number) => {
    if (delta === 0) return;
    setRemaining((prev) => {
      const next = Math.max(0, prev + delta);
      if (next === 0) setIsRunning(false);
      return next;
    });
    if (delta > 0) {
      setDuration((d) => d + delta);
    }
  }, []);

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100)) : 0;

  const isPaused = isRestActive && !isRunning && remaining > 0;

  return {
    isRestActive,
    isRunning,
    isPaused,
    remaining,
    duration,
    progress,
    start,
    stop,
    pause,
    resume,
    adjustTime,
  };
}

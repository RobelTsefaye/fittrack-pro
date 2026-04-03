"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_REST_TIMER } from "@/lib/constants";

export function useRestTimer(defaultDuration = DEFAULT_REST_TIMER) {
  const [isRunning, setIsRunning] = useState(false);
  const [remaining, setRemaining] = useState(defaultDuration);
  const [duration, setDuration] = useState(defaultDuration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const start = useCallback((seconds?: number) => {
    const d = seconds ?? defaultDuration;
    setDuration(d);
    setRemaining(d);
    setIsRunning(true);
  }, [defaultDuration]);

  const stop = useCallback(() => {
    setIsRunning(false);
    setRemaining(duration);
  }, [duration]);

  const addTime = useCallback((seconds: number) => {
    setRemaining((prev) => prev + seconds);
  }, []);

  const progress = duration > 0 ? ((duration - remaining) / duration) * 100 : 0;

  return { isRunning, remaining, duration, progress, start, stop, addTime };
}

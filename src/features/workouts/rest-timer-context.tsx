"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_REST_TIMER } from "@/lib/constants";
import { RestTimerBar } from "./components/rest-timer-bar";
import {
  startRestTimerActivity,
  updateRestTimerActivity,
  endRestTimerActivity,
  onRestTimerActivityAdjustment,
} from "@/lib/native/rest-timer-activity";
import {
  scheduleRestTimerNotification,
  cancelRestTimerNotification,
} from "@/lib/native/local-notifications";
import { hapticRestTimerExpired } from "@/lib/native/haptics";

/**
 * Persists a +/-15s nudge server-side (see rest-timer-adjust route) so the
 * Watch — which computes its own countdown independently from workout data,
 * see computeRestTimerEndsAt in watch-connectivity.ts — picks it up too.
 * Previously an adjustment made from this bar (or the Live Activity, synced
 * in via onRestTimerActivityAdjustment below) never reached the server at
 * all, so the phone and Watch countdowns could silently drift apart.
 * Fire-and-forget, matching the other native-bridge calls in this file.
 */
function persistRestTimerAdjust(workoutId: string, deltaSeconds: number): void {
  if (deltaSeconds === 0) return;
  fetch(`/api/workouts/${workoutId}/rest-timer-adjust`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ deltaSeconds }),
  }).catch(() => {
    /* best-effort — the local countdown already reflects the nudge */
  });
}

const STORAGE_KEY = "fittrack-rest-v1";

type Persisted = {
  endsAt: number | null;
  duration: number;
  pausedRemaining: number | null;
};

function readPersisted(): Persisted | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (typeof p.duration !== "number") return null;
    return {
      endsAt: typeof p.endsAt === "number" ? p.endsAt : null,
      duration: p.duration,
      pausedRemaining:
        typeof p.pausedRemaining === "number" ? p.pausedRemaining : null,
    };
  } catch {
    return null;
  }
}

function writePersisted(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type RestTimerOptions = {
  onExpire?: () => void;
  /** Enables persisting +/-15s adjustments server-side (see adjustTime) so
   *  the Watch and Live Activity converge on the same countdown. Omitted
   *  call sites just keep the previous local-only behavior. */
  workoutId?: string;
};

export type RestTimerApi = {
  isRestActive: boolean;
  isRunning: boolean;
  isPaused: boolean;
  remaining: number;
  duration: number;
  progress: number;
  start: (seconds?: number, opts?: RestTimerOptions) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  adjustTime: (delta: number) => void;
};

const RestTimerContext = createContext<RestTimerApi | null>(null);

/** Stable action callbacks — consuming only these avoids the 1-second
 *  re-render that the full state context causes while a timer runs. */
export type RestTimerActions = Pick<
  RestTimerApi,
  "start" | "stop" | "pause" | "resume" | "adjustTime"
>;

const RestTimerActionsContext = createContext<RestTimerActions | null>(null);

export function useRestTimer(): RestTimerApi {
  const ctx = useContext(RestTimerContext);
  if (!ctx) {
    throw new Error("useRestTimer must be used within RestTimerProvider");
  }
  return ctx;
}

export function useRestTimerActions(): RestTimerActions {
  const ctx = useContext(RestTimerActionsContext);
  if (!ctx) {
    throw new Error("useRestTimerActions must be used within RestTimerProvider");
  }
  return ctx;
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [duration, setDuration] = useState(DEFAULT_REST_TIMER);
  /** After natural expiry, keep chip until user dismisses */
  const [doneVisible, setDoneVisible] = useState(false);
  const [tick, setTick] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const hydrated = useRef(false);
  const expireFired = useRef(false);
  const onExpireRef = useRef<(() => void) | undefined>(undefined);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  /** Which workout adjustTime persists nudges against — see RestTimerOptions.workoutId. */
  const activeWorkoutIdRef = useRef<string | undefined>(undefined);
  /** Mirrors `endsAt`/`pausedRemaining` synchronously for the Live Activity
   *  resync effect below, which has empty deps and would otherwise close
   *  over stale state when computing how much the Dynamic Island buttons
   *  actually changed the timer by. */
  const endsAtRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef<number | null>(null);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release?.();
    wakeLockRef.current = null;
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* denied / unsupported */
    }
  }, []);

  useEffect(() => {
    const p = readPersisted();
    /* localStorage restore on mount; must stay synchronous so `hydrated` is set before sibling effects */
    /* eslint-disable react-hooks/set-state-in-effect */
    if (p?.pausedRemaining != null && p.pausedRemaining > 0) {
      setPausedRemaining(p.pausedRemaining);
      setDuration(p.duration);
    } else if (p?.endsAt != null) {
      if (p.endsAt <= Date.now()) {
        clearPersisted();
      } else {
        setEndsAt(p.endsAt);
        setDuration(p.duration);
        void requestWakeLock();
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    hydrated.current = true;
  }, [requestWakeLock]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (doneVisible && endsAt == null && pausedRemaining == null) {
      return;
    }
    if (endsAt == null && pausedRemaining == null && !doneVisible) {
      clearPersisted();
      return;
    }
    if (!doneVisible) {
      writePersisted({
        endsAt,
        duration,
        pausedRemaining,
      });
    }
  }, [endsAt, pausedRemaining, duration, doneVisible]);

  /** Tick only while a timer is actually counting down — an unconditional
   *  interval would re-render the provider every second app-wide. */
  useEffect(() => {
    if (endsAt == null || pausedRemaining != null) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    const onVis = () => setTick((n) => n + 1);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [endsAt, pausedRemaining]);

  useEffect(() => {
    endsAtRef.current = endsAt;
    pausedRemainingRef.current = pausedRemaining;
  }, [endsAt, pausedRemaining]);

  const isRunning = endsAt != null && pausedRemaining == null && remaining > 0;
  const isPaused = pausedRemaining != null && pausedRemaining > 0;

  /** Wall-clock remaining + expiry; Date.now only outside render (microtask). */
  useEffect(() => {
    queueMicrotask(() => {
      let nextRemaining = 0;
      if (doneVisible && endsAt == null && pausedRemaining == null) {
        nextRemaining = 0;
      } else if (pausedRemaining != null) {
        nextRemaining = pausedRemaining;
      } else if (endsAt == null) {
        nextRemaining = 0;
      } else {
        nextRemaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      }

      setRemaining((prev) => (prev === nextRemaining ? prev : nextRemaining));

      if (pausedRemaining != null) return;
      if (endsAt == null) return;
      if (nextRemaining > 0) {
        expireFired.current = false;
        return;
      }
      if (expireFired.current) return;
      expireFired.current = true;
      setEndsAt(null);
      setPausedRemaining(null);
      setDoneVisible(true);
      clearPersisted();
      releaseWakeLock();
      void endRestTimerActivity();
      void cancelRestTimerNotification();
      void hapticRestTimerExpired();
      queueMicrotask(() => onExpireRef.current?.());
    });
  }, [endsAt, pausedRemaining, doneVisible, tick, releaseWakeLock]);

  const start = useCallback(
    (seconds?: number, opts?: RestTimerOptions) => {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      onExpireRef.current = opts?.onExpire;
      activeWorkoutIdRef.current = opts?.workoutId;
      expireFired.current = false;
      setDoneVisible(false);
      const d = Math.max(1, seconds ?? DEFAULT_REST_TIMER);
      setDuration(d);
      const newEndsAt = Date.now() + d * 1000;
      setEndsAt(newEndsAt);
      setPausedRemaining(null);
      void requestWakeLock();
      void startRestTimerActivity(newEndsAt);
      void scheduleRestTimerNotification(newEndsAt);
    },
    [requestWakeLock]
  );

  const stop = useCallback(() => {
    onExpireRef.current = undefined;
    activeWorkoutIdRef.current = undefined;
    expireFired.current = false;
    setEndsAt(null);
    setPausedRemaining(null);
    setDoneVisible(false);
    setDuration(DEFAULT_REST_TIMER);
    clearPersisted();
    releaseWakeLock();
    void endRestTimerActivity();
    void cancelRestTimerNotification();
  }, [releaseWakeLock]);

  const pause = useCallback(() => {
    if (endsAt == null || pausedRemaining != null) return;
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setPausedRemaining(left);
    setEndsAt(null);
    releaseWakeLock();
    void updateRestTimerActivity({ pausedRemainingSeconds: left });
    void cancelRestTimerNotification();
  }, [endsAt, pausedRemaining, releaseWakeLock]);

  const resume = useCallback(() => {
    if (pausedRemaining == null || pausedRemaining <= 0) return;
    const newEndsAt = Date.now() + pausedRemaining * 1000;
    setEndsAt(newEndsAt);
    setPausedRemaining(null);
    void requestWakeLock();
    void updateRestTimerActivity({ endsAt: newEndsAt });
    void scheduleRestTimerNotification(newEndsAt);
  }, [pausedRemaining, requestWakeLock]);

  const adjustTime = useCallback((delta: number) => {
    if (delta === 0) return;
    if (activeWorkoutIdRef.current) {
      persistRestTimerAdjust(activeWorkoutIdRef.current, delta);
    }
    if (pausedRemaining != null) {
      setPausedRemaining((prev) => {
        if (prev == null) return prev;
        const next = Math.max(0, prev + delta);
        void updateRestTimerActivity({ pausedRemainingSeconds: next });
        return next;
      });
      if (delta > 0) setDuration((d) => d + delta);
      return;
    }
    if (endsAt != null) {
      setEndsAt((e) => {
        if (e == null) return e;
        const next = e + delta * 1000;
        void updateRestTimerActivity({ endsAt: next });
        void scheduleRestTimerNotification(next);
        return next;
      });
      if (delta > 0) setDuration((d) => d + delta);
    }
  }, [endsAt, pausedRemaining]);

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100)) : 0;

  const api = useMemo<RestTimerApi>(
    () => ({
      isRestActive: isRunning || isPaused || doneVisible,
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
    }),
    [
      adjustTime,
      doneVisible,
      duration,
      isPaused,
      isRunning,
      pause,
      progress,
      remaining,
      resume,
      start,
      stop,
    ]
  );

  useEffect(() => {
    return () => {
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  /** iOS often releases wake lock when the tab is hidden; re-acquire when visible. */
  useEffect(() => {
    const onVis = () => {
      if (
        document.visibilityState === "visible" &&
        endsAt != null &&
        pausedRemaining == null &&
        Date.now() < endsAt
      ) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [endsAt, pausedRemaining, requestWakeLock]);

  /** On foreground, resync from the running Live Activity's current state —
   *  it reflects any -15s/+15s adjustments made from the Dynamic Island / Lock
   *  Screen buttons while backgrounded. The native side is the source of truth
   *  for that state, so we only mirror it into React here (no
   *  `updateRestTimerActivity` call back out). `duration` is bumped if the new
   *  remaining exceeds it, so the progress bar denominator stays sane. */
  useEffect(() => {
    return onRestTimerActivityAdjustment(({ endsAt: nextEndsAt, pausedRemainingSeconds }) => {
      // Whatever the Dynamic Island / Lock Screen +/-15 buttons changed the
      // timer by (however many taps happened while backgrounded) also needs
      // to reach the server — this is the third of three adjustment entry
      // points (phone bar, Watch, Live Activity) that previously only ever
      // updated its own local/native state, leaving the others stale.
      if (pausedRemainingSeconds != null) {
        const delta =
          pausedRemainingRef.current != null
            ? pausedRemainingSeconds - pausedRemainingRef.current
            : 0;
        if (delta !== 0 && activeWorkoutIdRef.current) {
          persistRestTimerAdjust(activeWorkoutIdRef.current, delta);
        }
        setPausedRemaining(pausedRemainingSeconds);
        setDuration((d) => Math.max(d, pausedRemainingSeconds));
        void cancelRestTimerNotification();
      } else if (nextEndsAt != null) {
        const delta =
          endsAtRef.current != null
            ? Math.round((nextEndsAt - endsAtRef.current) / 1000)
            : 0;
        if (delta !== 0 && activeWorkoutIdRef.current) {
          persistRestTimerAdjust(activeWorkoutIdRef.current, delta);
        }
        setEndsAt(nextEndsAt);
        const remainingSecs = Math.max(0, Math.ceil((nextEndsAt - Date.now()) / 1000));
        setDuration((d) => Math.max(d, remainingSecs));
        void scheduleRestTimerNotification(nextEndsAt);
      }
    });
  }, []);

  const actions = useMemo<RestTimerActions>(
    () => ({ start, stop, pause, resume, adjustTime }),
    [start, stop, pause, resume, adjustTime]
  );

  return (
    <RestTimerActionsContext.Provider value={actions}>
      <RestTimerContext.Provider value={api}>
        {children}
        <RestTimerBar timer={api} />
      </RestTimerContext.Provider>
    </RestTimerActionsContext.Provider>
  );
}

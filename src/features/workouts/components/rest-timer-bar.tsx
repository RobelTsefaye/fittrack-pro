"use client";

import { Button } from "@/components/ui/button";
import { Minus, Pause, Play, Plus, Timer, X } from "lucide-react";
import type { RestTimerApi } from "../rest-timer-context";
import { useI18n } from "@/lib/i18n-provider";

interface RestTimerBarProps {
  timer: RestTimerApi;
}

const STEP = 10;

/** Compact floating rest timer (no full-width bar). */
export function RestTimerBar({ timer }: RestTimerBarProps) {
  const { t } = useI18n();
  if (!timer.isRestActive) return null;

  const minutes = Math.floor(timer.remaining / 60);
  const seconds = timer.remaining % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;

  const canTick = timer.remaining > 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      role="status"
      aria-live="polite"
    >
      {/* "Dynamic Island" look — dark capsule regardless of app theme, so it
       *  reads as a native-style notch even though iOS never actually shows
       *  a Live Activity for the foreground app itself. The wrapper above is
       *  pointer-events-none because it spans the full viewport width (for
       *  centering) even where the capsule isn't — without this, its empty
       *  edges silently swallowed taps on whatever sat underneath them
       *  (e.g. the "Finish workout" button on narrow screens where it lands
       *  right below the header, inside this bar's full-width hit area). */}
      <div className="pointer-events-auto w-[min(100%,22rem)] overflow-hidden rounded-[1.75rem] bg-black/92 px-4 py-2.5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl supports-[backdrop-filter]:bg-black/85">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Timer className="h-4 w-4 shrink-0 text-orange-400" />
            <span className="truncate text-xs font-medium text-white/60">{t("workouts.restTimerTitle")}</span>
          </div>
          <span className="font-display text-xl font-bold tabular-nums tracking-tight text-white">
            {timer.remaining === 0 ? (
              <span className="text-green-400">{t("workouts.restDone")}</span>
            ) : (
              display
            )}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full bg-orange-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${timer.progress}%` }}
          />
        </div>

        {/* Controls — 44px touch targets on mobile, compact on desktop */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              className="h-9 gap-0.5 px-2.5 text-xs text-white/85 hover:bg-white/10 hover:text-white sm:h-7 sm:px-1.5"
              onClick={() => timer.adjustTime(-STEP)}
              disabled={!canTick}
              aria-label={t("workouts.restTimerSkipForward")}
            >
              <Minus className="h-3 w-3" />
              {STEP}s
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="h-9 gap-0.5 px-2.5 text-xs text-white/85 hover:bg-white/10 hover:text-white sm:h-7 sm:px-1.5"
              onClick={() => timer.adjustTime(STEP)}
              aria-label={t("workouts.restTimerRewind")}
            >
              <Plus className="h-3 w-3" />
              {STEP}s
            </Button>
          </div>
          <div className="flex gap-1">
            {timer.isRunning && canTick ? (
              <Button
                size="icon-xs"
                variant="ghost"
                className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white sm:h-7 sm:w-7"
                onClick={timer.pause}
                aria-label={t("workouts.restTimerPause")}
              >
                <Pause className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </Button>
            ) : canTick ? (
              <Button
                size="icon-xs"
                variant="ghost"
                className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white sm:h-7 sm:w-7"
                onClick={timer.resume}
                aria-label={t("workouts.restTimerResume")}
              >
                <Play className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </Button>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white sm:h-7 sm:w-7"
              onClick={timer.stop}
              aria-label={t("workouts.restTimerDismiss")}
            >
              <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

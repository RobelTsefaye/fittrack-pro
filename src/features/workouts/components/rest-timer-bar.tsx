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
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 w-[min(100%-2rem,20rem)] rounded-xl border border-border/60 bg-card/98 p-3 shadow-xl ring-1 ring-foreground/5 backdrop-blur supports-[backdrop-filter]:bg-card/92 lg:right-8 lg:bottom-6"
      role="status"
      aria-live="polite"
    >
      {/* Progress bar */}
      <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${timer.progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Timer className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium text-muted-foreground">{t("workouts.restTimerTitle")}</span>
        </div>
        <span className="font-display text-xl font-bold tabular-nums tracking-tight">
          {timer.remaining === 0 ? (
            <span className="text-green-500 dark:text-green-400">{t("workouts.restDone")}</span>
          ) : (
            display
          )}
        </span>
      </div>

      {/* Controls — 44px touch targets on mobile, compact on desktop */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <Button
            size="xs"
            variant="outline"
            className="h-9 gap-0.5 px-2.5 text-xs sm:h-7 sm:px-1.5"
            onClick={() => timer.adjustTime(-STEP)}
            disabled={!canTick}
            aria-label={t("workouts.restTimerSkipForward")}
          >
            <Minus className="h-3 w-3" />
            {STEP}s
          </Button>
          <Button
            size="xs"
            variant="outline"
            className="h-9 gap-0.5 px-2.5 text-xs sm:h-7 sm:px-1.5"
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
              variant="secondary"
              className="h-9 w-9 sm:h-7 sm:w-7"
              onClick={timer.pause}
              aria-label={t("workouts.restTimerPause")}
            >
              <Pause className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          ) : canTick ? (
            <Button
              size="icon-xs"
              variant="secondary"
              className="h-9 w-9 sm:h-7 sm:w-7"
              onClick={timer.resume}
              aria-label={t("workouts.restTimerResume")}
            >
              <Play className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          ) : null}
          <Button
            size="icon-xs"
            variant="ghost"
            className="h-9 w-9 sm:h-7 sm:w-7"
            onClick={timer.stop}
            aria-label={t("workouts.restTimerDismiss")}
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

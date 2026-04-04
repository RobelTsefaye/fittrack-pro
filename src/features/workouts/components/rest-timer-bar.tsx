"use client";

import { Button } from "@/components/ui/button";
import { Minus, Pause, Play, Plus, Timer, X } from "lucide-react";
import type { useRestTimer } from "../hooks/use-rest-timer";
import { useI18n } from "@/lib/i18n-provider";

interface RestTimerBarProps {
  timer: ReturnType<typeof useRestTimer>;
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
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 w-[min(100%-2rem,18rem)] rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90 lg:right-8 lg:bottom-6"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${timer.progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Timer className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium">{t("workouts.restTimerTitle")}</span>
        </div>
        <span className="font-mono text-base font-bold tabular-nums">
          {timer.remaining === 0 ? (
            <span className="text-green-600">{t("workouts.restDone")}</span>
          ) : (
            display
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-1">
          <Button
            size="xs"
            variant="outline"
            className="h-7 gap-0.5 px-1.5"
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
            className="h-7 gap-0.5 px-1.5"
            onClick={() => timer.adjustTime(STEP)}
            aria-label={t("workouts.restTimerRewind")}
          >
            <Plus className="h-3 w-3" />
            {STEP}s
          </Button>
        </div>
        <div className="flex gap-0.5">
          {timer.isRunning && canTick ? (
            <Button
              size="icon-xs"
              variant="secondary"
              className="h-7 w-7"
              onClick={timer.pause}
              aria-label={t("workouts.restTimerPause")}
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          ) : canTick ? (
            <Button
              size="icon-xs"
              variant="secondary"
              className="h-7 w-7"
              onClick={timer.resume}
              aria-label={t("workouts.restTimerResume")}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            size="icon-xs"
            variant="ghost"
            className="h-7 w-7"
            onClick={timer.stop}
            aria-label={t("workouts.restTimerDismiss")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

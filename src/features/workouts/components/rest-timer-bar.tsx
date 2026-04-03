"use client";

import { Button } from "@/components/ui/button";
import { Timer, Plus, X } from "lucide-react";
import type { useRestTimer } from "../hooks/use-rest-timer";
import { useI18n } from "@/lib/i18n-provider";

interface RestTimerBarProps {
  timer: ReturnType<typeof useRestTimer>;
}

export function RestTimerBar({ timer }: RestTimerBarProps) {
  const { t } = useI18n();
  if (!timer.isRunning && timer.remaining === timer.duration) return null;

  const minutes = Math.floor(timer.remaining / 60);
  const seconds = timer.remaining % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 safe-bottom-pad lg:left-64">
      <div className="relative h-1 bg-muted">
        <div
          className="absolute inset-y-0 left-0 bg-primary transition-all duration-1000"
          style={{ width: `${timer.progress}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t("workouts.restTimerTitle")}</span>
        </div>

        <span className="text-lg font-mono font-bold tabular-nums">
          {timer.remaining === 0 ? (
            <span className="text-green-600">{t("workouts.restDone")}</span>
          ) : (
            display
          )}
        </span>

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => timer.addTime(15)}
            disabled={!timer.isRunning}
          >
            <Plus className="h-3 w-3" />
            15s
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={timer.stop}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

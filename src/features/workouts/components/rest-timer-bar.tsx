"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronUp, Minus, Pause, Play, Plus, SkipForward } from "lucide-react";
import type { RestTimerApi } from "../rest-timer-context";
import { useI18n } from "@/lib/i18n-provider";
import { cn } from "@/lib/utils";

interface RestTimerBarProps {
  timer: RestTimerApi;
}

const STEP = 10;
/** Expanded controls collapse on their own so they don't sit over the header. */
const AUTO_COLLAPSE_MS = 5000;
const RING_RADIUS = 13;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Small circular countdown ring, filled by `progress` (0–100). */
function ProgressRing({ progress, done }: { progress: number; done: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 -rotate-90" aria-hidden>
      <circle cx="16" cy="16" r={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-white/15" />
      <circle
        cx="16"
        cy="16"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, progress)) / 100)}
        className={cn(
          "transition-[stroke-dashoffset] duration-1000 ease-linear",
          done ? "stroke-[oklch(0.937_0.267_131)]" : "stroke-orange-400"
        )}
      />
    </svg>
  );
}

/**
 * Floating "Dynamic Island" rest timer. Collapsed it is a slim pill (ring +
 * countdown) that leaves the workout visible; tapping it reveals the
 * controls.
 */
export function RestTimerBar({ timer }: RestTimerBarProps) {
  // Mount the pill only while a rest is active so its expanded state resets
  // for every new rest.
  if (!timer.isRestActive) return null;
  return <RestTimerPill timer={timer} />;
}

function RestTimerPill({ timer }: RestTimerBarProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const id = window.setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(id);
  }, [expanded]);

  const minutes = Math.floor(timer.remaining / 60);
  const seconds = timer.remaining % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const done = timer.remaining === 0;
  const canTick = !done;

  const controlClass =
    "h-10 gap-1 rounded-full px-3 text-sm text-white/85 hover:bg-white/10 hover:text-white";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      role="status"
      aria-live="polite"
    >
      {/* Dark capsule regardless of app theme so it reads as a native notch.
       *  The full-width wrapper is pointer-events-none so its empty edges
       *  never swallow taps on content underneath. */}
      <div
        className={cn(
          "pointer-events-auto overflow-hidden bg-black/92 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl transition-all duration-300 ease-out supports-[backdrop-filter]:bg-black/85",
          expanded ? "w-[min(100%,22rem)] rounded-[1.75rem]" : "w-auto rounded-full",
          done && "ring-[oklch(0.937_0.267_131)]/60 animate-[pulse_1.6s_ease-in-out_infinite]"
        )}
      >
        <button
          type="button"
          onClick={() => {
            // Rest is over: one tap clears the pill.
            if (done) timer.stop();
            else setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
          aria-label={done ? t("workouts.restTimerDismiss") : t("workouts.restTimerTitle")}
          className="flex w-full items-center gap-2.5 py-1.5 pl-1.5 pr-4 text-left"
        >
          <ProgressRing progress={done ? 100 : timer.progress} done={done} />
          {expanded ? (
            <span className="flex-1 truncate text-xs font-medium text-white/60">
              {t("workouts.restTimerTitle")}
            </span>
          ) : null}
          <span
            className={cn(
              "font-display text-lg font-bold tabular-nums tracking-tight",
              done ? "text-[oklch(0.937_0.267_131)]" : "text-white",
              !timer.isRunning && canTick && "opacity-60"
            )}
          >
            {done ? t("workouts.restDone") : display}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-white/50" /> : null}
        </button>

        {expanded ? (
          <div className="flex items-center justify-between gap-1 border-t border-white/10 px-2 py-1.5">
            <Button
              size="xs"
              variant="ghost"
              className={controlClass}
              onClick={() => timer.adjustTime(-STEP)}
              disabled={!canTick}
              aria-label={t("workouts.restTimerSkipForward")}
            >
              <Minus className="h-3.5 w-3.5" />
              {STEP}s
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className={controlClass}
              onClick={() => timer.adjustTime(STEP)}
              aria-label={t("workouts.restTimerRewind")}
            >
              <Plus className="h-3.5 w-3.5" />
              {STEP}s
            </Button>
            {canTick ? (
              <Button
                size="icon-xs"
                variant="ghost"
                className="h-10 w-10 rounded-full text-white/85 hover:bg-white/10 hover:text-white"
                onClick={timer.isRunning ? timer.pause : timer.resume}
                aria-label={
                  timer.isRunning ? t("workouts.restTimerPause") : t("workouts.restTimerResume")
                }
              >
                {timer.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              className="h-10 w-10 rounded-full text-white/85 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setExpanded(false);
                timer.stop();
              }}
              aria-label={t("workouts.restTimerDismiss")}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

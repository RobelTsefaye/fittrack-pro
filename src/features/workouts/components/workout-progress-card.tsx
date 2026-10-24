"use client";

import { useI18n } from "@/lib/i18n-provider";
import type { WorkoutProgress } from "../workout-progress";

/** Live in-session stats: completed sets bar + sets / volume / exercises. */
export function WorkoutProgressCard({
  progress,
  weightLabel,
}: {
  progress: WorkoutProgress;
  weightLabel: string;
}) {
  const { t, locale } = useI18n();
  const pct = Math.round(progress.ratio * 100);

  const stats = [
    {
      label: t("workouts.progressSets"),
      value: `${progress.completedSets}/${progress.totalSets}`,
    },
    {
      label: t("workouts.progressVolume"),
      value: `${Math.round(progress.volume).toLocaleString(locale)} ${weightLabel}`,
    },
    {
      label: t("workouts.progressExercises"),
      value: `${progress.exercisesDone}/${progress.exerciseCount}`,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("workouts.progressSets")}
        </span>
        <span className="font-display text-2xl font-bold tabular-nums text-primary">{pct}%</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-full rounded-full bg-primary shadow-[0_0_12px] shadow-primary/60 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </dt>
            <dd className="truncate font-display text-lg font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

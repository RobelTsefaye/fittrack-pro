"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n-provider";
import { splitHue } from "@/lib/split-hue";
import { useCountUp } from "@/lib/use-count-up";
import type { WorkoutListItemDTO } from "@/features/workouts/workouts-list-data";

const DAY_MS = 86_400_000;

function mondayOf(d: Date) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/**
 * This week at a glance: sessions, sets and time counting up, Monday to Sunday with
 * each training day in its split's colour, and how many weeks in a row you trained.
 */
export function WeekHero({ workouts }: { workouts: WorkoutListItemDTO[] }) {
  const { t, locale } = useI18n();
  const stats = useMemo(() => {
    const done = workouts.filter((w) => w.completedAt);
    const monday = mondayOf(new Date());
    const thisWeek = done.filter((w) => new Date(w.startedAt) >= monday);
    const days = Array.from({ length: 7 }, (_, i) => {
      const start = new Date(monday.getTime() + i * DAY_MS);
      const end = new Date(start.getTime() + DAY_MS);
      const w = thisWeek.find((x) => new Date(x.startedAt) >= start && new Date(x.startedAt) < end);
      return { date: start, hue: w ? splitHue(w.name) : null, name: w?.name ?? null };
    });
    const sets = thisWeek.reduce((n, w) => n + w.workoutExercises.reduce((m, we) => m + we.sets.length, 0), 0);
    const minutes = Math.round(thisWeek.reduce((n, w) => n + (w.durationSeconds ?? 0), 0) / 60);
    // Weeks in a row with at least one session; this week counts once it has one.
    let streak = 0;
    for (let k = thisWeek.length ? 0 : 1; k < 52; k++) {
      const from = new Date(monday.getTime() - k * 7 * DAY_MS);
      const to = new Date(from.getTime() + 7 * DAY_MS);
      if (done.some((w) => new Date(w.startedAt) >= from && new Date(w.startedAt) < to)) streak++;
      else break;
    }
    return { count: thisWeek.length, sets, minutes, days, streak };
  }, [workouts]);

  const count = useCountUp(stats.count);
  const sets = useCountUp(stats.sets);
  const minutes = useCountUp(stats.minutes);
  const today = new Date().toDateString();
  const de = locale === "de";
  const weekday = (d: Date) => d.toLocaleDateString(de ? "de-DE" : "en-US", { weekday: "narrow" });
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;

  return (
    <section className="week-hero" data-glass>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="week-hero-eyebrow">{t("workouts.week.title")}</p>
          <p className="week-hero-number">
            {Math.round(count)}
            <span>{t(stats.count === 1 ? "workouts.week.sessionOne" : "workouts.week.sessionMany")}</span>
          </p>
        </div>
        {stats.streak > 1 && (
          <p className="week-hero-streak" title={t("workouts.week.streakHint")}>
            🔥 {stats.streak} {t("workouts.week.streak")}
          </p>
        )}
      </div>

      <div className="week-hero-days" role="list">
        {stats.days.map((d, i) => (
          <div
            key={i}
            role="listitem"
            className="week-hero-day"
            data-today={d.date.toDateString() === today || undefined}
            style={{ animationDelay: `${120 + i * 40}ms` }}
            title={d.name ?? undefined}
          >
            <span className="week-hero-dot" style={d.hue ? { background: d.hue, boxShadow: `0 0 14px ${d.hue}55` } : undefined} />
            <span className="week-hero-weekday">{weekday(d.date)}</span>
          </div>
        ))}
      </div>

      <div className="week-hero-stats">
        <div><b>{Math.round(sets)}</b><span>{t("workouts.week.sets")}</span></div>
        <div><b>{hm(minutes)}</b><span>{t("workouts.week.time")}</span></div>
      </div>
    </section>
  );
}

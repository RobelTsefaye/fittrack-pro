"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Play } from "lucide-react";
import Link from "@/components/app-link";
import { useI18n } from "@/lib/i18n-provider";
import { splitHue } from "@/lib/split-hue";
import { planHref, workoutHref } from "@/lib/workout-href";
import type { WorkoutListItemDTO } from "@/features/workouts/workouts-list-data";

type PlanRow = { id: string; name: string; sessions?: Array<{ id: string; name: string; weekdays?: number[] }> };

const WEEKDAY_KEYS = ["weekdayMon", "weekdayTue", "weekdayWed", "weekdayThu", "weekdayFri", "weekdaySat", "weekdaySun"] as const;

/**
 * Today's workout from the plan's fixed weekdays, one tap to start. On a rest day (or
 * when today's is done) it says what comes next. Hidden while no day is bound to a weekday.
 */
export function TodayStart({ workouts }: { workouts: WorkoutListItemDTO[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: PlanRow[] } | null) => {
        setPlan(j?.data?.find((p) => p.sessions?.some((s) => s.weekdays?.length)) ?? null);
      })
      .catch(() => {});
  }, []);
  if (!plan?.sessions) return null;

  const now = new Date();
  const weekday = (now.getDay() + 6) % 7;
  const today = plan.sessions.find((s) => s.weekdays?.includes(weekday));
  const doneToday = today && workouts.some((w) =>
    w.completedAt && new Date(w.startedAt).toDateString() === now.toDateString() && w.name?.trim() === today.name.trim());
  // The next bound day after today.
  let next: { name: string; label: string } | null = null;
  for (let k = 1; k <= 7 && !next; k++) {
    const d = (weekday + k) % 7;
    const s = plan.sessions.find((x) => x.weekdays?.includes(d));
    if (s) next = { name: s.name, label: k === 1 ? t("workouts.today.tomorrow") : t(`settings.${WEEKDAY_KEYS[d]}`) };
  }

  async function start(sessionId: string) {
    if (!navigator.onLine) return router.push(planHref(plan!.id));
    setStarting(true);
    try {
      const res = await fetch(`/api/plan-sessions/${sessionId}/start`, { method: "POST" });
      const id = res.ok ? ((await res.json()).data?.id as string | undefined) : undefined;
      if (id) {
        window.dispatchEvent(new Event("fittrack-active-workout-changed"));
        router.push(workoutHref(id));
        return;
      }
    } catch { /* offline: the plan page can start it offline */ }
    setStarting(false);
    router.push(planHref(plan!.id));
  }

  if (today && !doneToday) {
    const hue = splitHue(today.name);
    return (
      <section className="today-start" style={{ ["--hue" as string]: hue }}>
        <div className="min-w-0">
          <p className="today-start-eyebrow">{t("workouts.today.title")}</p>
          <p className="today-start-name">{today.name}</p>
          <p className="today-start-sub">{plan.name}</p>
        </div>
        <button type="button" className="today-start-go" onClick={() => start(today.id)} disabled={starting} aria-label={t("workouts.today.start")}>
          <Play className="h-5 w-5" fill="currentColor" />
          <span>{starting ? t("plans.starting") : t("workouts.today.start")}</span>
        </button>
      </section>
    );
  }

  return (
    <Link href={planHref(plan.id)} className="today-start today-start-rest" style={{ ["--hue" as string]: next ? splitHue(next.name) : "#83838C" }}>
      <div className="min-w-0">
        <p className="today-start-eyebrow">
          {doneToday ? <><Check className="inline h-3.5 w-3.5" /> {t("workouts.today.done", { name: today!.name })}</> : t("workouts.today.rest")}
        </p>
        {next && <p className="today-start-sub">{next.label}: <b style={{ color: "var(--hue)" }}>{next.name}</b></p>}
      </div>
    </Link>
  );
}

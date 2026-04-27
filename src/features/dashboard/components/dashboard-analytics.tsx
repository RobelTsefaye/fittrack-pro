"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Dumbbell, Flame, Trophy, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardClientPayload } from "@/features/dashboard/queries";
import { useI18n } from "@/lib/i18n-provider";
import { NextWorkoutCard } from "./next-workout-card";

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const DashboardAnalyticsChartsSection = dynamic(
  () =>
    import("./dashboard-analytics-charts").then((m) => m.DashboardAnalyticsChartsSection),
  {
    ssr: false,
    loading: () => <DashboardChartsSkeleton />,
  }
);

function DashboardChartsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="h-40 rounded-lg bg-muted/40" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-lg bg-muted/40" />
        <div className="h-72 rounded-lg bg-muted/40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-48 rounded-lg bg-muted/40" />
        <div className="h-48 rounded-lg bg-muted/40" />
        <div className="h-48 rounded-lg bg-muted/40" />
      </div>
      <div className="h-56 rounded-lg bg-muted/40" />
    </div>
  );
}

interface DashboardAnalyticsProps {
  userName?: string | null;
  weightUnit: "KG" | "LB";
  payload: DashboardClientPayload;
}

export function DashboardAnalytics({
  userName,
  weightUnit,
  payload,
}: DashboardAnalyticsProps) {
  const { t } = useI18n();
  const { summary, nextSession, heatmap } = payload;

  const statCards = useMemo(() => [
    {
      title: t("dashboard.totalWorkouts"),
      value: nf.format(summary.totalWorkouts),
      hint: t("dashboard.completedSessions"),
      icon: Dumbbell,
      accent: false,
    },
    {
      title: t("dashboard.thisWeek"),
      value: nf.format(summary.completedThisWeek),
      hint: t("dashboard.weekHint"),
      icon: TrendingUp,
      accent: false,
    },
    {
      title: t("dashboard.thisMonth"),
      value: nf.format(summary.completedThisMonth),
      hint: t("dashboard.completed"),
      icon: TrendingUp,
      accent: false,
    },
    {
      title: t("dashboard.streak"),
      value: nf.format(summary.workoutStreakDays),
      hint: t("dashboard.streakHint"),
      icon: Flame,
      accent: true,
    },
    {
      title: t("dashboard.personalRecords"),
      value: nf.format(summary.personalRecordsCount),
      hint: t("dashboard.prHint"),
      icon: Trophy,
      accent: true,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [
    summary.totalWorkouts,
    summary.completedThisWeek,
    summary.completedThisMonth,
    summary.workoutStreakDays,
    summary.personalRecordsCount,
  ]);

  const empty = summary.totalWorkouts === 0;
  const heatmapWeeks = heatmap.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">
          {t("dashboard.welcome")}
          {userName ? `, ${userName.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--sys-label2)]">{t("dashboard.trainingOverview")}</p>
      </div>

      <NextWorkoutCard nextSession={nextSession} />

      <div className="stagger-children grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((s) => (
          <Card
            key={s.title}
            className={s.accent ? "border-primary/30 bg-primary/5 dark:bg-primary/[0.08]" : undefined}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4">
              <CardTitle className="text-xs font-medium text-[var(--sys-label2)] uppercase tracking-wide">
                {s.title}
              </CardTitle>
              <s.icon className={`h-4 w-4 ${s.accent ? "text-primary" : "text-[var(--sys-label3)]"}`} />
            </CardHeader>
            <CardContent className="pb-4">
              <div className={`font-display text-[2rem] font-bold tracking-tight leading-none${s.accent ? " text-primary" : ""}`}>
                {s.value}
              </div>
              <p className="mt-1 text-[0.6875rem] text-[var(--sys-label3)]">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DashboardAnalyticsChartsSection
        weightUnit={weightUnit}
        heatmapWeeks={heatmapWeeks}
        empty={empty}
        payload={payload}
      />
    </div>
  );
}

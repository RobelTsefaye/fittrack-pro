"use client";

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

  const statCards = [
    {
      title: t("dashboard.totalWorkouts"),
      value: nf.format(summary.totalWorkouts),
      hint: t("dashboard.completedSessions"),
      icon: Dumbbell,
    },
    {
      title: t("dashboard.thisWeek"),
      value: nf.format(summary.completedThisWeek),
      hint: t("dashboard.weekHint"),
      icon: TrendingUp,
    },
    {
      title: t("dashboard.thisMonth"),
      value: nf.format(summary.completedThisMonth),
      hint: t("dashboard.completed"),
      icon: TrendingUp,
    },
    {
      title: t("dashboard.streak"),
      value: nf.format(summary.workoutStreakDays),
      hint: t("dashboard.streakHint"),
      icon: Flame,
    },
    {
      title: t("dashboard.personalRecords"),
      value: nf.format(summary.personalRecordsCount),
      hint: t("dashboard.prHint"),
      icon: Trophy,
    },
  ];

  const empty = summary.totalWorkouts === 0;
  const heatmapWeeks = heatmap.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("dashboard.welcome")}
          {userName ? `, ${userName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground">{t("dashboard.trainingOverview")}</p>
      </div>

      <NextWorkoutCard nextSession={nextSession} />

      <div className="stagger-children grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((s) => (
          <Card key={s.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.title}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
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

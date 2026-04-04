"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ListOrdered, Scale, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { exercisePath, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DashboardClientPayload } from "@/features/dashboard/queries";
import { useI18n } from "@/lib/i18n-provider";
import { WorkoutHeatmap } from "./workout-heatmap";

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function DashboardAnalyticsChartsSection({
  weightUnit,
  heatmapWeeks,
  empty,
  payload,
}: {
  weightUnit: "KG" | "LB";
  heatmapWeeks: number;
  empty: boolean;
  payload: DashboardClientPayload;
}) {
  const { t } = useI18n();
  const unit = weightUnit === "LB" ? "lb" : "kg";
  const {
    recentPRs,
    volumeWeekly,
    volumeMonthly,
    consistencyWeekly,
    bodyWeightTrend,
    recentWorkouts,
    topExercises,
    heatmap,
    insights,
  } = payload;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.heatmapTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              {t("dashboard.heatmapHint", { weeks: heatmapWeeks })}
            </p>
          </CardHeader>
          <CardContent>
            <WorkoutHeatmap
              columns={heatmap}
              lessLabel={t("dashboard.heatmapLess")}
              moreLabel={t("dashboard.heatmapMore")}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.insightsTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              {t("dashboard.insightsSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((ins) => (
              <div
                key={ins.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm",
                  ins.severity === "attention" &&
                    "border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10",
                  ins.severity === "suggest" && "border-primary/25 bg-muted/40",
                  ins.severity === "info" && "border-border bg-muted/20"
                )}
              >
                <p className="text-foreground/90">
                  {t(ins.messageKey, ins.params as Record<string, string | number | undefined>)}
                </p>
                {ins.href ? (
                  <Link
                    href={ins.href}
                    className={cn(
                      buttonVariants({ variant: "link" }),
                      "mt-1 h-auto p-0 text-xs"
                    )}
                  >
                    {t("dashboard.insightViewExercise")}
                  </Link>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.volumeTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">{t("dashboard.volumeHint")}</p>
          </CardHeader>
          <CardContent className="h-[280px] min-h-[240px]">
            <Tabs defaultValue="week" className="h-full">
              <TabsList
                variant="line"
                className="mb-3 w-full max-w-full min-w-0 flex-nowrap justify-start overflow-x-auto"
              >
                <TabsTrigger value="week">{t("dashboard.weekly")}</TabsTrigger>
                <TabsTrigger value="month">{t("dashboard.monthly")}</TabsTrigger>
              </TabsList>
              <TabsContent value="week" className="h-[220px]">
                <VolumeBars
                  data={volumeWeekly}
                  dataKey="volume"
                  emptyMessage={t("dashboard.volumeEmpty")}
                  tooltipLabel={t("dashboard.volumeLabel")}
                />
              </TabsContent>
              <TabsContent value="month" className="h-[220px]">
                <VolumeBars
                  data={volumeMonthly}
                  dataKey="volume"
                  emptyMessage={t("dashboard.volumeEmpty")}
                  tooltipLabel={t("dashboard.volumeLabel")}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.consistencyTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">{t("dashboard.consistencyHint")}</p>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={consistencyWeekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                  formatter={(v) => [
                    typeof v === "number" ? v : "—",
                    t("dashboard.workoutsAxis"),
                  ]}
                />
                <Bar dataKey="workoutCount" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{t("dashboard.bodyWeightTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {bodyWeightTrend.length < 2 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {t("dashboard.bodyWeightSparklineHint")}
              </p>
            ) : (
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={bodyWeightTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bwFillDash" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                      formatter={(v) => [
                        typeof v === "number" ? `${v} ${unit}` : "—",
                        t("dashboard.weightLabel"),
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke="var(--color-chart-4)"
                      fill="url(#bwFillDash)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <Link
              href={ROUTES.bodyWeight}
              className={cn(
                buttonVariants({ variant: "link", size: "sm" }),
                "mt-2 h-auto px-0"
              )}
            >
              {t("dashboard.manageBodyWeight")}
            </Link>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              {t("dashboard.recentPrs")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPRs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.noPrsYet")}</p>
            ) : (
              <ul className="space-y-3">
                {recentPRs.map((pr) => (
                  <li key={pr.id} className="text-sm border-b border-border/60 pb-3 last:border-0 last:pb-0">
                    <Link
                      href={exercisePath(pr.exercise.id)}
                      className="font-medium hover:underline"
                    >
                      {pr.exercise.name}
                    </Link>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {pr.weight} {unit} × {pr.reps}
                      {pr.estimated1RM != null
                        ? ` · ${t("dashboard.est1rm")} ${Math.round(pr.estimated1RM * 10) / 10} ${unit}`
                        : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(pr.achievedAt)
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              {t("dashboard.topVolume")}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">{t("dashboard.topVolumeHint")}</p>
          </CardHeader>
          <CardContent>
            {topExercises.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.noVolumeData")}</p>
            ) : (
              <ol className="space-y-2 text-sm list-decimal list-inside">
                {topExercises.map((ex) => (
                  <li key={ex.exerciseId} className="marker:text-muted-foreground">
                    <Link
                      href={exercisePath(ex.exerciseId)}
                      className="font-medium hover:underline"
                    >
                      {ex.name}
                    </Link>
                    <span className="text-muted-foreground"> — {nf.format(ex.volume)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">{t("dashboard.recentWorkouts")}</CardTitle>
          <Link
            href={ROUTES.workouts}
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "h-auto shrink-0 self-start px-0 sm:self-auto"
            )}
          >
            {t("dashboard.viewAll")}
          </Link>
        </CardHeader>
        <CardContent>
          {recentWorkouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.noWorkoutsYet")}{" "}
              <Link href={ROUTES.newWorkout} className="underline underline-offset-2">
                {t("dashboard.startOne")}
              </Link>
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {recentWorkouts.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/workouts/${w.id}`}
                    className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{w.name?.trim() || t("dashboard.workoutFallback")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.exerciseCount", { count: w.exerciseCount })} ·{" "}
                        {formatDuration(w.durationSeconds)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(w.completedAt))}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {empty ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.gettingStarted")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{t("dashboard.gettingStartedIntro")}</p>
            <ol className="list-inside list-decimal space-y-2">
              <li>{t("dashboard.gsStep1")}</li>
              <li>
                <Link href={ROUTES.newWorkout} className="underline underline-offset-2">
                  {t("dashboard.startOne")}
                </Link>{" "}
                {t("dashboard.gsStep2")}
              </li>
              <li>{t("dashboard.gsStep3")}</li>
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function VolumeBars({
  data,
  dataKey,
  emptyMessage,
  tooltipLabel,
}: {
  data: { label: string; volume: number }[];
  dataKey: string;
  emptyMessage: string;
  tooltipLabel: string;
}) {
  const allZero = data.every((d) => d.volume === 0);
  if (allZero) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground text-center px-4">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
        <YAxis tick={{ fontSize: 10 }} width={40} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
          formatter={(v) => [typeof v === "number" ? nf.format(v) : "—", tooltipLabel]}
        />
        <Bar dataKey={dataKey} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

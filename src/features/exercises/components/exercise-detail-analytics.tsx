"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExerciseProgressChart } from "./exercise-progress-chart";
import { ExerciseVolumeChart } from "./exercise-volume-chart";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import type { ProgressPoint, VolumePoint } from "@/features/exercises/progress-types";

export type AnalyticsHistoryRow = {
  setId: string;
  workoutId: string;
  workoutName: string | null;
  weight: number;
  reps: number;
  rpe: number | null;
  estimated1RM: number;
  completedAt: string;
};

export type AnalyticsBestPr = {
  weight: number;
  reps: number;
  estimated1RM: number | null;
  achievedAt: string;
};

interface ExerciseDetailAnalyticsProps {
  weightUnit: "KG" | "LB";
  bestPr: AnalyticsBestPr | null;
  progressBySession: ProgressPoint[];
  volumeBySession: VolumePoint[];
  history: AnalyticsHistoryRow[];
}

export function ExerciseDetailAnalytics({
  weightUnit,
  bestPr,
  progressBySession,
  volumeBySession,
  history,
}: ExerciseDetailAnalyticsProps) {
  const { t } = useI18n();
  const unit = weightUnit === "LB" ? "lb" : "kg";

  return (
    <>
      {bestPr && bestPr.estimated1RM != null ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <Trophy className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("exercises.prTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-semibold">
              {bestPr.weight} {unit} × {bestPr.reps}
              <span className="text-muted-foreground font-normal">
                {t("exercises.prEst1rm", {
                  est: String(Math.round(bestPr.estimated1RM * 10) / 10),
                  unit,
                })}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                new Date(bestPr.achievedAt)
              )}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("exercises.trendTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            {t("exercises.trendHint")}
          </p>
        </CardHeader>
        <CardContent>
          <ExerciseProgressChart data={progressBySession} weightUnit={weightUnit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("exercises.volumeTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            {t("exercises.volumeHint")}
          </p>
        </CardHeader>
        <CardContent>
          <ExerciseVolumeChart data={volumeBySession} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("exercises.historyTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            {t("exercises.historyHint")}
          </p>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("exercises.noSetsYet")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2">{t("exercises.tableDate")}</th>
                    <th className="px-3 py-2">{t("exercises.tableWorkout")}</th>
                    <th className="px-3 py-2 text-right">{unit}</th>
                    <th className="px-3 py-2 text-right">{t("exercises.tableReps")}</th>
                    <th className="px-3 py-2 text-right">{t("exercises.tableEst1rm")}</th>
                    <th className="px-3 py-2 text-right">{t("exercises.tableRpe")}</th>
                    <th className="px-3 py-2 w-[100px]" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.setId} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "short" }).format(
                          new Date(row.completedAt)
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[140px] truncate">
                        {row.workoutName?.trim() || t("exercises.workoutFallback")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.weight > 0 ? row.weight : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.reps}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.estimated1RM > 0
                          ? Math.round(row.estimated1RM * 10) / 10
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {row.rpe ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/workouts/${row.workoutId}`}
                          className={cn(
                            buttonVariants({ variant: "link", size: "sm" }),
                            "h-auto px-0"
                          )}
                        >
                          {t("common.view")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

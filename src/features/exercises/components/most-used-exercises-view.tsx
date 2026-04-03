"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROUTES, exercisePath } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import {
  ExerciseDetailAnalytics,
  type AnalyticsBestPr,
  type AnalyticsHistoryRow,
} from "./exercise-detail-analytics";
import type { ProgressPoint, VolumePoint } from "@/features/exercises/progress-types";

type UsageRow = {
  exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    equipment: string;
  };
  setCount: number;
  workoutCount: number;
  lastUsed: string;
};

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface MostUsedExercisesViewProps {
  weightUnit: "KG" | "LB";
}

export function MostUsedExercisesView({ weightUnit }: MostUsedExercisesViewProps) {
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [histLoading, setHistLoading] = useState(false);
  const [history, setHistory] = useState<AnalyticsHistoryRow[]>([]);
  const [progressBySession, setProgressBySession] = useState<ProgressPoint[]>([]);
  const [volumeBySession, setVolumeBySession] = useState<VolumePoint[]>([]);
  const [bestPr, setBestPr] = useState<AnalyticsBestPr | null>(null);
  const [meta, setMeta] = useState<{
    name: string;
    muscleGroup: string;
    equipment: string;
  } | null>(null);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    const res = await fetch("/api/exercises/most-used");
    const json = await res.json();
    const list = (json.data ?? []) as UsageRow[];
    setUsage(list);
    setUsageLoading(false);
    if (list.length > 0) {
      setSelectedId((prev) => prev ?? list[0].exercise.id);
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const loadHistory = useCallback(
    async (exerciseId: string) => {
      setHistLoading(true);
      const res = await fetch(`/api/exercises/${exerciseId}/history`);
      if (!res.ok) {
        setHistLoading(false);
        return;
      }
      const json = await res.json();
      const d = json.data;
      setMeta({
        name: d.exercise.name,
        muscleGroup: d.exercise.muscleGroup,
        equipment: d.exercise.equipment,
      });
      setHistory(d.history ?? []);
      setProgressBySession(d.progressBySession ?? []);
      setVolumeBySession(d.volumeBySession ?? []);
      setBestPr(d.bestPersonalRecord ?? null);
      setHistLoading(false);
    },
    []
  );

  useEffect(() => {
    if (selectedId) loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const selectedUsage = usage.find((u) => u.exercise.id === selectedId);

  return (
    <div className="space-y-6">
      <Link
        href={ROUTES.exercises}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1 -ml-2")}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("exercises.detailBack")}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-7 w-7 text-primary" />
          {t("exercises.mostUsedTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("exercises.mostUsedSubtitle")}</p>
      </div>

      {usageLoading ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/80" />
            ))}
          </div>
          <div className="lg:col-span-8 h-96 animate-pulse rounded-xl bg-muted/60" />
        </div>
      ) : usage.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("exercises.mostUsedEmpty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-4 space-y-2 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
            {usage.map((row, index) => {
              const active = row.exercise.id === selectedId;
              return (
                <div
                  key={row.exercise.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(row.exercise.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(row.exercise.id);
                    }
                  }}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors cursor-pointer",
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-mono text-muted-foreground tabular-nums w-6">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={exercisePath(row.exercise.id)}
                        className="font-medium truncate hover:underline underline-offset-2 block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.exercise.name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("exercises.mostUsedSets", { count: row.setCount })} ·{" "}
                        {t("exercises.mostUsedWorkouts", { count: row.workoutCount })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("exercises.lastPerformed")}:{" "}
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                          new Date(row.lastUsed)
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-8 space-y-6 min-w-0">
            {histLoading || !meta ? (
              <div className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                <div className="h-52 animate-pulse rounded-xl bg-muted/80" />
                <div className="h-52 animate-pulse rounded-xl bg-muted/80" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">{meta.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant="secondary">{formatLabel(meta.muscleGroup)}</Badge>
                      <Badge variant="outline">{formatLabel(meta.equipment)}</Badge>
                    </div>
                    {selectedUsage ? (
                      <p className="text-sm text-muted-foreground mt-2">
                        {t("exercises.mostUsedSets", { count: selectedUsage.setCount })} ·{" "}
                        {t("exercises.mostUsedWorkouts", { count: selectedUsage.workoutCount })}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={exercisePath(selectedId!)}
                    className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
                  >
                    {t("exercises.usageOpenFull")}
                  </Link>
                </div>

                <ExerciseDetailAnalytics
                  weightUnit={weightUnit}
                  bestPr={bestPr}
                  progressBySession={progressBySession}
                  volumeBySession={volumeBySession}
                  history={history}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

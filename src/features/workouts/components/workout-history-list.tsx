"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { ROUTES, exercisePath } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { tryGetOfflineDb } from "@/lib/offline/db";
import type { WorkoutListItemDTO } from "@/features/workouts/workouts-list-data";

type WorkoutListItem = WorkoutListItemDTO;

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}m ${s}s`;
}

function sortWorkouts(data: WorkoutListItem[]) {
  return [...data].sort((a, b) => {
    const aActive = !a.completedAt;
    const bActive = !b.completedAt;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}

async function saveWorkoutListCache(data: WorkoutListItem[]) {
  const db = tryGetOfflineDb();
  if (!db) return;
  await db.workoutListCache.put({
    id: "default",
    payload: JSON.stringify(data),
    updatedAt: Date.now(),
  });
}

async function loadWorkoutListCache(): Promise<WorkoutListItem[] | null> {
  const db = tryGetOfflineDb();
  if (!db) return null;
  const row = await db.workoutListCache.get("default");
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as WorkoutListItem[];
  } catch {
    return null;
  }
}

export function WorkoutHistoryList({
  initialWorkouts,
}: {
  initialWorkouts: WorkoutListItemDTO[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutListItem[]>(() =>
    sortWorkouts(initialWorkouts)
  );
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteCompletedWorkout(id: string) {
    if (!confirm(t("workouts.deleteCompletedConfirm"))) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      window.alert(t("workouts.deleteCompletedOffline"));
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/workouts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(j.error ?? t("workouts.deleteCompletedFailed"));
        return;
      }
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    setWorkouts(sortWorkouts(initialWorkouts));
  }, [initialWorkouts]);

  const fetchWorkouts = useCallback(async () => {
    setLoading(true);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = await loadWorkoutListCache();
      if (cached) setWorkouts(sortWorkouts(cached));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/workouts?limit=50");
      const json = await res.json();
      const data: WorkoutListItem[] = json.data ?? [];
      const sorted = sortWorkouts(data);
      setWorkouts(sorted);
      await saveWorkoutListCache(sorted);
    } catch {
      const cached = await loadWorkoutListCache();
      if (cached) setWorkouts(cached);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const onSynced = () => void fetchWorkouts();
    window.addEventListener("fittrack-offline-synced", onSynced);
    return () => window.removeEventListener("fittrack-offline-synced", onSynced);
  }, [fetchWorkouts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("workouts.title")}</h1>
          <p className="text-muted-foreground">{t("workouts.subtitle")}</p>
        </div>
        <Link
          href={ROUTES.newWorkout}
          prefetch
          className={cn(buttonVariants(), "inline-flex w-full justify-center sm:w-auto")}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("workouts.startWorkout")}
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="h-16 animate-pulse bg-muted/50 rounded-lg" />
            </Card>
          ))}
        </div>
      ) : workouts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Dumbbell className="h-12 w-12 text-muted-foreground/50" />
            <CardHeader className="text-center">
              <CardTitle className="text-lg">{t("workouts.noWorkouts")}</CardTitle>
            </CardHeader>
            <p className="text-sm text-muted-foreground mb-4">{t("workouts.noWorkoutsHint")}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                href={ROUTES.newWorkout}
                prefetch
                className={cn(buttonVariants(), "inline-flex justify-center")}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("workouts.startWorkout")}
              </Link>
              <Link
                href={ROUTES.plans}
                prefetch
                className={cn(buttonVariants({ variant: "outline" }), "inline-flex justify-center")}
              >
                {t("plans.title")}
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {workouts.map((w) => {
            const active = !w.completedAt;
            const exerciseCount = w.workoutExercises.length;
            const setCount = w.workoutExercises.reduce((n, we) => n + we.sets.length, 0);
            const exerciseLabel =
              exerciseCount === 1
                ? t("workouts.exerciseOne")
                : t("workouts.exerciseMany", { count: exerciseCount });
            const setLabel =
              setCount === 1 ? t("workouts.setOne") : t("workouts.setMany", { count: setCount });
            return (
              <li key={w.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  className="transition-colors hover:bg-muted/40 cursor-pointer"
                  onClick={() => router.push(`/workouts/${w.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/workouts/${w.id}`);
                    }
                  }}
                >
                  <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">
                          {w.name?.trim() || t("workouts.workoutFallback")}
                        </span>
                        {active ? (
                          <Badge>{t("common.inProgress")}</Badge>
                        ) : (
                          <Badge variant="secondary">{t("common.completed")}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatWhen(w.startedAt)}</p>
                      {w.workoutExercises.length > 0 ? (
                        <p className="text-sm text-muted-foreground flex flex-wrap gap-x-1 gap-y-0.5">
                          {w.workoutExercises.slice(0, 5).map((we, i) => (
                            <span key={we.exercise.id} className="inline-flex items-center">
                              {i > 0 ? <span className="mr-1">·</span> : null}
                              <Link
                                href={exercisePath(we.exercise.id)}
                                className="truncate hover:underline underline-offset-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {we.exercise.name}
                              </Link>
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 text-xs text-muted-foreground">
                      <span>{exerciseLabel}</span>
                      <span>{setLabel}</span>
                      {!active && formatDuration(w.durationSeconds) ? (
                        <span>{formatDuration(w.durationSeconds)}</span>
                      ) : null}
                      {!active ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={deletingId === w.id}
                          aria-label={t("workouts.deleteCompletedAria")}
                          title={t("workouts.deleteCompleted")}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void deleteCompletedWorkout(w.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "@/components/app-link";
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
import {
  saveMostUsedExercisesCache,
  loadMostUsedExercisesCache,
  saveExerciseDetailCache,
  loadExerciseDetailCache,
} from "@/lib/offline/screen-caches";

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

type ExerciseHistoryPayload = {
  exercise: { name: string; muscleGroup: string; equipment: string };
  history: AnalyticsHistoryRow[];
  progressBySession: ProgressPoint[];
  volumeBySession: VolumePoint[];
  bestPersonalRecord: AnalyticsBestPr | null;
};

export function MostUsedExercisesView({ weightUnit }: MostUsedExercisesViewProps) {
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  // Distinguishes "fetch failed" from "no usage data yet" — otherwise a
  // network error/500 renders the "no exercises used" empty state to a user
  // with plenty of history. Bumping `usageReload` re-runs the fetch effect.
  const [usageError, setUsageError] = useState(false);
  const [usageReload, setUsageReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Which exercise the currently-loaded history belongs to. `histLoading` is
  // derived from this rather than being its own state toggled inside the
  // fetch effect — setting a loading flag synchronously in an effect trips
  // React 19's set-state-in-effect rule, whereas a render-time derivation
  // (selected ≠ loaded) shows the spinner immediately with no extra render.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Set when loading the *current* selection failed. Without it, the stale
  // meta/history of the previously selected exercise would render under the
  // new selection's identity (its counts and "open full" link) — mixed data.
  const [histError, setHistError] = useState(false);
  const [histReload, setHistReload] = useState(0);
  const [history, setHistory] = useState<AnalyticsHistoryRow[]>([]);
  const [progressBySession, setProgressBySession] = useState<ProgressPoint[]>([]);
  const [volumeBySession, setVolumeBySession] = useState<VolumePoint[]>([]);
  const [bestPr, setBestPr] = useState<AnalyticsBestPr | null>(null);
  const [meta, setMeta] = useState<{
    name: string;
    muscleGroup: string;
    equipment: string;
  } | null>(null);

  // Cache-first (project-docs/instant-load-roadmap.md Phase B): paint the
  // last-known usage list immediately, then silently refresh in the
  // background. Only the "no cache at all" path shows a loading/error state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadMostUsedExercisesCache<UsageRow[]>();
      if (cancelled) return;
      if (cached) {
        setUsage(cached);
        setUsageError(false);
        setUsageLoading(false);
        if (cached.length > 0) {
          setSelectedId((prev) => prev ?? cached[0].exercise.id);
        }
      }

      try {
        const res = await fetch("/api/exercises/most-used");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const list = (json.data ?? []) as UsageRow[];
        setUsage(list);
        setUsageError(false);
        if (list.length > 0) {
          setSelectedId((prev) => prev ?? list[0].exercise.id);
        }
        void saveMostUsedExercisesCache(list);
      } catch {
        if (!cancelled && !cached) setUsageError(true);
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [usageReload]);

  const histLoading = selectedId != null && selectedId !== loadedId;

  // Cache-first (project-docs/instant-load-roadmap.md Phase B), same
  // exerciseDetailCache exercise-detail-view.tsx writes to — a plain click
  // through from here can already be warm. `loadedId` is set as soon as
  // *anything* (cache or fresh) renders, so the derived `histLoading` clears
  // immediately on a cache hit instead of waiting on the network.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      const applyPayload = (d: ExerciseHistoryPayload) => {
        setMeta({
          name: d.exercise.name,
          muscleGroup: d.exercise.muscleGroup,
          equipment: d.exercise.equipment,
        });
        setHistory(d.history ?? []);
        setProgressBySession(d.progressBySession ?? []);
        setVolumeBySession(d.volumeBySession ?? []);
        setBestPr(d.bestPersonalRecord ?? null);
      };

      const cached = await loadExerciseDetailCache<ExerciseHistoryPayload>(selectedId);
      if (cancelled) return;
      if (cached) {
        applyPayload(cached);
        setHistError(false);
        setLoadedId(selectedId);
      }

      try {
        const res = await fetch(`/api/exercises/${selectedId}/history`);
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const d = json.data as ExerciseHistoryPayload;
        applyPayload(d);
        setHistError(false);
        void saveExerciseDetailCache(selectedId, d);
      } catch {
        if (!cancelled && !cached) setHistError(true);
      } finally {
        if (!cancelled) setLoadedId(selectedId);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, histReload]);

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
      ) : usageError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <p className="text-sm text-muted-foreground text-center">{t("common.loadFailed")}</p>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline" }))}
              onClick={() => {
                setUsageError(false);
                setUsageLoading(true);
                setUsageReload((k) => k + 1);
              }}
            >
              {t("common.retry")}
            </button>
          </CardContent>
        </Card>
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
            {histLoading ? (
              <div className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                <div className="h-52 animate-pulse rounded-xl bg-muted/80" />
                <div className="h-52 animate-pulse rounded-xl bg-muted/80" />
              </div>
            ) : histError ? (
              // Checked before the meta panel: `meta` may still hold the
              // previously selected exercise's data, and rendering it here
              // would show exercise A's charts under exercise B's identity.
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
                  <p className="text-sm text-muted-foreground text-center">{t("common.loadFailed")}</p>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline" }))}
                    onClick={() => {
                      setHistError(false);
                      setLoadedId(null);
                      setHistReload((k) => k + 1);
                    }}
                  >
                    {t("common.retry")}
                  </button>
                </CardContent>
              </Card>
            ) : !meta ? (
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

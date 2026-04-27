"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, Plus, Trash2, ChevronRight, Clock, Layers } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { ROUTES, exercisePath } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { tryGetOfflineDb } from "@/lib/offline/db";
import type { WorkoutListItemDTO } from "@/features/workouts/workouts-list-data";

type WorkoutListItem = WorkoutListItemDTO;

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
function formatDay(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}
function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(iso));
}
function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  if (m >= 60) { const h = Math.floor(m / 60); return `${h}h ${m % 60}m`; }
  return `${m}m`;
}
function sortWorkouts(data: WorkoutListItem[]) {
  return [...data].sort((a, b) => {
    const aA = !a.completedAt, bA = !b.completedAt;
    if (aA && !bA) return -1;
    if (!aA && bA) return 1;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}
async function saveWorkoutListCache(data: WorkoutListItem[]) {
  const db = tryGetOfflineDb(); if (!db) return;
  await db.workoutListCache.put({ id: "default", payload: JSON.stringify(data), updatedAt: Date.now() });
}
async function loadWorkoutListCache(): Promise<WorkoutListItem[] | null> {
  const db = tryGetOfflineDb(); if (!db) return null;
  const row = await db.workoutListCache.get("default"); if (!row) return null;
  try { return JSON.parse(row.payload) as WorkoutListItem[]; } catch { return null; }
}

export function WorkoutHistoryList({ initialWorkouts }: { initialWorkouts: WorkoutListItemDTO[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutListItem[]>(() => sortWorkouts(initialWorkouts));
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteCompletedWorkout(id: string) {
    if (!confirm(t("workouts.deleteCompletedConfirm"))) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      window.alert(t("workouts.deleteCompletedOffline")); return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/workouts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(j.error ?? t("workouts.deleteCompletedFailed")); return;
      }
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
      router.refresh();
    } finally { setDeletingId(null); }
  }

  useEffect(() => { setWorkouts(sortWorkouts(initialWorkouts)); }, [initialWorkouts]);

  const fetchWorkouts = useCallback(async () => {
    setLoading(true);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = await loadWorkoutListCache();
      if (cached) setWorkouts(sortWorkouts(cached));
      setLoading(false); return;
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

  const active  = workouts.filter((w) => !w.completedAt);
  const history = workouts.filter((w) =>  w.completedAt);

  return (
    <div className="space-y-8">

      {/* ── Page header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t("workouts.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--sys-label2)]">{t("workouts.subtitle")}</p>
        </div>
        <Link
          href={ROUTES.newWorkout}
          prefetch
          className={cn(buttonVariants({ size: "default" }), "shrink-0")}
        >
          <Plus className="h-4 w-4" />
          {t("workouts.startWorkout")}
        </Link>
      </div>

      {/* ── Empty state ─────────────────────────────── */}
      {!loading && workouts.length === 0 && (
        <div className="ios-group">
          <div className="flex flex-col items-center gap-4 py-16 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--sys-fill)]">
              <Dumbbell className="h-7 w-7 text-[var(--sys-label2)]" />
            </div>
            <div>
              <p className="font-semibold text-[0.9375rem]">{t("workouts.noWorkouts")}</p>
              <p className="mt-1 text-sm text-[var(--sys-label2)]">{t("workouts.noWorkoutsHint")}</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Link href={ROUTES.newWorkout} prefetch className={cn(buttonVariants(), "justify-center")}>
                <Plus className="h-4 w-4" />{t("workouts.startWorkout")}
              </Link>
              <Link href={ROUTES.plans} prefetch className={cn(buttonVariants({ variant: "outline" }), "justify-center")}>
                {t("plans.title")}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────── */}
      {loading && (
        <div className="ios-group animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="ios-row h-20">
              <div className="h-4 w-2/3 rounded-full bg-[var(--sys-fill2)]" />
            </div>
          ))}
        </div>
      )}

      {/* ── Active section ──────────────────────────── */}
      {!loading && active.length > 0 && (
        <section className="space-y-2">
          <p className="ios-section-label">{t("workouts.sectionActive")}</p>
          <WorkoutGroup
            workouts={active}
            onNavigate={(id) => router.push(`/workouts/${id}`)}
            onDelete={deleteCompletedWorkout}
            deletingId={deletingId}
            t={t}
          />
        </section>
      )}

      {/* ── History section ─────────────────────────── */}
      {!loading && history.length > 0 && (
        <section className="space-y-2">
          <p className="ios-section-label">{t("workouts.sectionHistory")}</p>
          <WorkoutGroup
            workouts={history}
            onNavigate={(id) => router.push(`/workouts/${id}`)}
            onDelete={deleteCompletedWorkout}
            deletingId={deletingId}
            t={t}
          />
        </section>
      )}
    </div>
  );
}

function WorkoutGroup({
  workouts,
  onNavigate,
  onDelete,
  deletingId,
  t,
}: {
  workouts: WorkoutListItem[];
  onNavigate: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  deletingId: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="ios-group">
      {workouts.map((w) => {
        const isActive = !w.completedAt;
        const exerciseCount = w.workoutExercises.length;
        const setCount = w.workoutExercises.reduce((n, we) => n + we.sets.length, 0);
        const dur = formatDuration(w.durationSeconds);

        return (
          <button
            key={w.id}
            type="button"
            className="ios-row group w-full cursor-pointer text-left gap-3 hover:bg-[var(--nav-hover-bg)] transition-colors"
            onClick={() => onNavigate(w.id)}
          >
            {/* Icon */}
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              isActive
                ? "bg-primary/15 dark:bg-primary/20"
                : "bg-[var(--sys-fill)]"
            )}>
              <Dumbbell className={cn("h-5 w-5", isActive ? "text-primary" : "text-[var(--sys-label2)]")} />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-[0.9375rem]">
                  {w.name?.trim() || t("workouts.workoutFallback")}
                </span>
                {isActive && (
                  <Badge variant="warning" className="shrink-0">{t("common.inProgress")}</Badge>
                )}
              </div>

              <p className="mt-0.5 text-xs text-[var(--sys-label2)]">
                {isActive ? formatTime(w.startedAt) : formatDay(w.startedAt)}
              </p>

              {/* Exercise names */}
              {w.workoutExercises.length > 0 && (
                <p className="mt-1 truncate text-xs text-[var(--sys-label3)]">
                  {w.workoutExercises.slice(0, 4).map((we) => we.exercise.name).join(" · ")}
                  {w.workoutExercises.length > 4 && ` +${w.workoutExercises.length - 4}`}
                </p>
              )}

              {/* Meta row */}
              <div className="mt-1 flex items-center gap-3 text-[0.7rem] text-[var(--sys-label3)]">
                {exerciseCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {exerciseCount}
                  </span>
                )}
                {setCount > 0 && <span>{setCount} sets</span>}
                {dur && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{dur}
                  </span>
                )}
              </div>
            </div>

            {/* Right side */}
            <div className="flex shrink-0 items-center gap-1">
              {!isActive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  disabled={deletingId === w.id}
                  aria-label={t("workouts.deleteCompletedAria")}
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    void onDelete(w.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <ChevronRight className="h-4 w-4 text-[var(--sys-label3)]" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

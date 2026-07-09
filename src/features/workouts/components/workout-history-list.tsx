"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, Plus, Trash2, ChevronRight, Clock, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { tryGetOfflineDb } from "@/lib/offline/db";
import type { WorkoutListItemDTO } from "@/features/workouts/workouts-list-data";

type WorkoutListItem = WorkoutListItemDTO;

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

function getTimePeriod(iso: string): "TODAY" | "THIS WEEK" | "LAST WEEK" | "EARLIER" {
  const date = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon
  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setDate(todayStart.getDate() - dayOfWeek);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  if (date >= todayStart) return "TODAY";
  if (date >= thisWeekStart) return "THIS WEEK";
  if (date >= lastWeekStart) return "LAST WEEK";
  return "EARLIER";
}

function groupWorkouts(workouts: WorkoutListItem[]) {
  const order: ("TODAY" | "THIS WEEK" | "LAST WEEK" | "EARLIER")[] = [
    "TODAY",
    "THIS WEEK",
    "LAST WEEK",
    "EARLIER",
  ];
  const map = new Map<string, WorkoutListItem[]>();
  for (const label of order) map.set(label, []);

  for (const w of workouts) {
    const ref = w.completedAt ?? w.startedAt;
    const label = !w.completedAt ? "TODAY" : getTimePeriod(ref);
    map.get(label)!.push(w);
  }

  return order
    .map((label) => ({ label, items: map.get(label)! }))
    .filter((g) => g.items.length > 0);
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

  const groups = groupWorkouts(workouts);

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────── */}
      <div className="flex items-start justify-between gap-4 px-0.5">
        <h1 className="page-title">{t("workouts.title")}</h1>
        <Link
          href={ROUTES.newWorkout}
          prefetch
          className="flex shrink-0 h-9 items-center gap-1.5 rounded-xl px-3.5 font-bold text-[13px] transition-opacity active:opacity-70"
          style={{ background: "#D4FF3A", color: "#0A1300" }}
        >
          <Plus className="h-4 w-4" />
          {t("workouts.startWorkout")}
        </Link>
      </div>

      {/* ── Empty state ─────────────────────────── */}
      {!loading && workouts.length === 0 && (
        <div
          className="flex flex-col items-center gap-4 rounded-[18px] py-16 px-6 text-center"
          style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <Dumbbell className="h-7 w-7" style={{ color: "#5E5E66" }} />
          </div>
          <div>
            <p className="font-semibold text-[0.9375rem]">{t("workouts.noWorkouts")}</p>
            <p className="mt-1 text-sm" style={{ color: "#9A9AA2" }}>{t("workouts.noWorkoutsHint")}</p>
          </div>
          <Link href={ROUTES.newWorkout} prefetch
            className="flex h-10 w-full max-w-xs items-center justify-center gap-1.5 rounded-xl font-bold text-[15px]"
            style={{ background: "#D4FF3A", color: "#0A1300" }}
          >
            <Plus className="h-4 w-4" />{t("workouts.startWorkout")}
          </Link>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────── */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i}
              className="h-16 rounded-[14px]"
              style={{ background: "#121214" }}
            />
          ))}
        </div>
      )}

      {/* ── Grouped sections ────────────────────── */}
      {!loading && groups.map((group) => (
        <section key={group.label} className="space-y-2">
          <p
            className="px-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: "#5E5E66" }}
          >
            {group.label}
          </p>
          <div
            className="overflow-hidden rounded-[16px]"
            style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {group.items.map((w, i) => {
              const isActive = !w.completedAt;
              const exerciseCount = w.workoutExercises.length;
              const setCount = w.workoutExercises.reduce((n, we) => n + we.sets.length, 0);
              const dur = formatDuration(w.durationSeconds);

              return (
                <button
                  key={w.id}
                  type="button"
                  className="group w-full cursor-pointer text-left transition-colors"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px",
                    borderTop: i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
                  }}
                  onClick={() => router.push(`/workouts/${w.id}`)}
                >
                  {/* Icon */}
                  <div
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: isActive
                        ? "rgba(212,255,58,0.14)"
                        : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {isActive ? (
                      <span
                        className="h-2.5 w-2.5 rounded-full animate-pulse"
                        style={{ background: "#D4FF3A", boxShadow: "0 0 8px #D4FF3A" }}
                      />
                    ) : (
                      <Dumbbell
                        className="h-4.5 w-4.5 h-[18px] w-[18px]"
                        style={{ color: "#9A9AA2" }}
                        strokeWidth={1.7}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-white">
                        {w.name?.trim() || t("workouts.workoutFallback")}
                      </span>
                      {isActive && (
                        <span
                          className="shrink-0 rounded-md px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-[0.06em]"
                          style={{
                            background: "rgba(212,255,58,0.14)",
                            color: "#D4FF3A",
                          }}
                        >
                          LIVE
                        </span>
                      )}
                    </div>

                    <p
                      className="mt-0.5 text-[12px]"
                      style={{ color: "#9A9AA2" }}
                    >
                      {isActive ? formatTime(w.startedAt) : formatDay(w.startedAt)}
                    </p>

                    {w.workoutExercises.length > 0 && (
                      <p
                        className="mt-0.5 truncate text-[11px]"
                        style={{ color: "#5E5E66" }}
                      >
                        {w.workoutExercises
                          .slice(0, 4)
                          .map((we) => we.exercise.name)
                          .join(" · ")}
                        {w.workoutExercises.length > 4 &&
                          ` +${w.workoutExercises.length - 4}`}
                      </p>
                    )}

                    <div
                      className="mt-1 flex items-center gap-3 text-[11px]"
                      style={{ color: "#5E5E66" }}
                    >
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

                  {/* Right */}
                  <div className="flex shrink-0 items-center gap-1">
                    {!isActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "#5E5E66" }}
                        disabled={deletingId === w.id}
                        aria-label={t("workouts.deleteCompletedAria")}
                        onClick={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          void deleteCompletedWorkout(w.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <ChevronRight
                      className="h-4 w-4"
                      style={{ color: "#5E5E66" }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

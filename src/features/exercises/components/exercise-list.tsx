"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "@/components/app-link";
import { useSearchParams } from "next/navigation";
import { Dumbbell, Plus, TrendingUp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExerciseCard, type ExerciseData } from "./exercise-card";
import { ExerciseFormDialog } from "./exercise-form-dialog";
import { ExerciseDeleteDialog } from "./exercise-delete-dialog";
import { useI18n } from "@/lib/i18n-provider";
import { ROUTES } from "@/lib/constants";
import { saveExerciseCatalog, loadExerciseCatalog } from "@/lib/offline/workout-offline-store";

export function ExerciseList({
  initialExercises,
  initialQuery = "",
}: {
  /** Server-prefetched list matching `initialQuery` — skips the first client fetch. */
  initialExercises?: ExerciseData[];
  initialQuery?: string;
} = {}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [exercises, setExercises] = useState<ExerciseData[]>(initialExercises ?? []);
  const [loading, setLoading] = useState(initialExercises == null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseData | null>(null);
  const [deletingExercise, setDeletingExercise] = useState<ExerciseData | null>(null);

  const loadFromCatalogCache = useCallback(async () => {
    const catalog = await loadExerciseCatalog();
    if (!catalog) { setExercises([]); return; }
    const search = searchParams.get("search")?.toLowerCase() ?? "";
    const muscleGroup = searchParams.get("muscleGroup");
    const equipment = searchParams.get("equipment");
    const filtered = catalog.filter((e) => {
      if (search && !e.name.toLowerCase().includes(search)) return false;
      if (muscleGroup && e.muscleGroup !== muscleGroup) return false;
      if (equipment && e.equipment !== equipment) return false;
      return true;
    });
    setExercises(filtered.map((e) => ({ ...e, notes: null, isCustom: false })));
  }, [searchParams]);

  const fetchExercises = useCallback(async () => {
    // Cache-first, always — paints the last-known (filtered) catalog
    // instantly instead of blocking on the network, then a fresh fetch
    // below quietly replaces it if online.
    await loadFromCatalogCache();
    setLoading(false);

    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const params = new URLSearchParams(searchParams.toString());
      const res = await fetch(`/api/exercises?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json() as { data?: ExerciseData[] };
      const data: ExerciseData[] = json.data ?? [];
      setExercises(data);
      if (!searchParams.has("search") && !searchParams.has("muscleGroup") && !searchParams.has("equipment")) {
        void saveExerciseCatalog(
          data.map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment }))
        );
      }
    } catch {
      // already showing cache (if any) — nothing more to do
    }
  }, [searchParams, loadFromCatalogCache]);

  // Skip the first fetch when the server already provided the matching list.
  const skipNextFetch = useRef(
    initialExercises != null && searchParams.toString() === initialQuery
  );
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    void fetchExercises();
  }, [fetchExercises]);

  // Keep the offline exercise catalog fresh even when the fetch was skipped.
  useEffect(() => {
    if (initialExercises == null || initialQuery !== "") return;
    void saveExerciseCatalog(
      initialExercises.map((e) => ({
        id: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEdit(exercise: ExerciseData) { setEditingExercise(exercise); setFormOpen(true); }
  function handleDelete(exercise: ExerciseData) { setDeletingExercise(exercise); }
  function handleFormClose(open: boolean) { setFormOpen(open); if (!open) setEditingExercise(null); }

  const grouped = exercises.reduce<Record<string, ExerciseData[]>>((acc, e) => {
    if (!acc[e.muscleGroup]) acc[e.muscleGroup] = [];
    acc[e.muscleGroup].push(e);
    return acc;
  }, {});

  const formatLabel = (v: string) =>
    v.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      {/* ── Page header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t("exercises.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--sys-label2)]">
            {t("exercises.countInLibrary", { count: exercises.length })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={ROUTES.exercisesUsage}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80"
          >
            <TrendingUp className="h-4 w-4" />
            {t("exercises.usageLink")}
          </Link>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={cn(buttonVariants({ size: "default" }), "shrink-0")}
          >
            <Plus className="h-4 w-4" />
            {t("exercises.newExercise")}
          </button>
        </div>
      </div>

      {/* ── Loading skeleton ─────────────────────────── */}
      {loading && (
        <div className="space-y-6">
          {[...Array(3)].map((_, g) => (
            <div key={g} className="space-y-2">
              <div className="h-3 w-28 rounded-full bg-[var(--sys-fill2)] animate-pulse" />
              <div className="ios-group animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="ios-row h-16">
                    <div className="h-9 w-9 rounded-xl bg-[var(--sys-fill2)]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-1/2 rounded-full bg-[var(--sys-fill2)]" />
                      <div className="h-2.5 w-1/3 rounded-full bg-[var(--sys-fill2)]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────── */}
      {!loading && exercises.length === 0 && (
        <div className="ios-group">
          <div className="flex flex-col items-center gap-4 py-16 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--sys-fill)]">
              <Dumbbell className="h-7 w-7 text-[var(--sys-label2)]" />
            </div>
            <div>
              <p className="font-semibold text-[0.9375rem]">{t("exercises.noExercises")}</p>
              <p className="mt-1 text-sm text-[var(--sys-label2)]">{t("exercises.noExercisesHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className={cn(buttonVariants(), "justify-center")}
            >
              <Plus className="h-4 w-4" />
              {t("exercises.newExercise")}
            </button>
          </div>
        </div>
      )}

      {/* ── Grouped exercise list ────────────────────── */}
      {!loading && exercises.length > 0 && (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, groupExercises]) => (
              <section key={group} className="space-y-2">
                <p className="ios-section-label">
                  {formatLabel(group)}{" "}
                  <span className="font-normal opacity-60">({groupExercises.length})</span>
                </p>
                <div className="ios-group">
                  {groupExercises.map((exercise) => (
                    <ExerciseCard
                      key={exercise.id}
                      exercise={exercise}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <ExerciseFormDialog
        open={formOpen}
        onOpenChange={handleFormClose}
        exercise={editingExercise}
        onSuccess={fetchExercises}
      />

      <ExerciseDeleteDialog
        exercise={deletingExercise}
        onClose={() => setDeletingExercise(null)}
        onSuccess={fetchExercises}
      />
    </>
  );
}

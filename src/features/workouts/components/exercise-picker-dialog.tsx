"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Loader2, ExternalLink } from "lucide-react";
import { MUSCLE_GROUPS, exercisePath } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { loadExerciseCatalog, saveExerciseCatalog } from "@/lib/offline/workout-offline-store";

export type ExercisePickerExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
};

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function filterExercises(list: ExercisePickerExercise[], search: string, muscleGroup: string) {
  let out = list;
  if (muscleGroup) out = out.filter((e) => e.muscleGroup === muscleGroup);
  const q = search.trim().toLowerCase();
  if (q) out = out.filter((e) => e.name.toLowerCase().includes(q));
  return out;
}

interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exercise: ExercisePickerExercise) => void;
  loading?: boolean;
}

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onSelect,
  loading,
}: ExercisePickerDialogProps) {
  const { t } = useI18n();
  const [exercises, setExercises] = useState<ExercisePickerExercise[]>([]);
  const [search, setSearch] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [fetching, setFetching] = useState(false);
  const [offlineMode, setOfflineMode] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine
  );

  useEffect(() => {
    const on = () => setOfflineMode(false);
    const off = () => setOfflineMode(true);
    if (typeof window !== "undefined") {
      setOfflineMode(!navigator.onLine);
      window.addEventListener("online", on);
      window.addEventListener("offline", off);
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    if (offlineMode) {
      let cancelled = false;
      void (async () => {
        setFetching(true);
        const cat = await loadExerciseCatalog();
        if (cancelled) return;
        const list = cat ?? [];
        setExercises(filterExercises(list, search, muscleGroup));
        setFetching(false);
      })();
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setFetching(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (muscleGroup) params.set("muscleGroup", muscleGroup);

      const res = await fetch(`/api/exercises?${params}`, { credentials: "include" });
      if (res.ok) {
        const json = (await res.json()) as { data: ExercisePickerExercise[] };
        setExercises(json.data);
        await saveExerciseCatalog(json.data);
      }
      setFetching(false);
    }

    const timeout = setTimeout(() => void load(), 300);
    return () => clearTimeout(timeout);
  }, [open, search, muscleGroup, offlineMode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md pt-[env(safe-area-inset-top,0px)]">
        <DialogHeader>
          <DialogTitle>{t("exercises.addExerciseDialogTitle")}</DialogTitle>
          <DialogDescription>{t("exercises.addExerciseDialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("exercises.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setMuscleGroup("")}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                !muscleGroup
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("exercises.all")}
            </button>
            {MUSCLE_GROUPS.map((mg) => (
              <button
                key={mg}
                type="button"
                onClick={() => setMuscleGroup(mg === muscleGroup ? "" : mg)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  muscleGroup === mg
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {formatLabel(mg)}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto -mx-4 px-4">
          {fetching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : exercises.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {offlineMode ? t("exercises.offlinePickerNoCache") : t("exercises.noSearchResults")}
            </p>
          ) : (
            <div className="space-y-1">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className="flex w-full items-center gap-2 rounded-lg p-2.5 hover:bg-muted transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(exercise)}
                    disabled={loading}
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                  >
                    <p className="text-sm font-medium">{exercise.name}</p>
                    <div className="flex gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {formatLabel(exercise.muscleGroup)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {formatLabel(exercise.equipment)}
                      </Badge>
                    </div>
                  </button>
                  <Link
                    href={exercisePath(exercise.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-background hover:text-foreground"
                    title={t("exercises.pickerOpenDetail")}
                    aria-label={t("exercises.pickerOpenDetail")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    disabled={loading}
                    onClick={() => onSelect(exercise)}
                    aria-label={t("workouts.addExercise")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

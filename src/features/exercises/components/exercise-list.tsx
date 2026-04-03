"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, ListChecks, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExerciseCard, type ExerciseData } from "./exercise-card";
import { ExerciseFormDialog } from "./exercise-form-dialog";
import { ExerciseDeleteDialog } from "./exercise-delete-dialog";
import { useI18n } from "@/lib/i18n-provider";
import { ROUTES } from "@/lib/constants";

export function ExerciseList() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [exercises, setExercises] = useState<ExerciseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseData | null>(null);
  const [deletingExercise, setDeletingExercise] = useState<ExerciseData | null>(null);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    const res = await fetch(`/api/exercises?${params.toString()}`);
    const json = await res.json();
    setExercises(json.data ?? []);
    setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  function handleEdit(exercise: ExerciseData) {
    setEditingExercise(exercise);
    setFormOpen(true);
  }

  function handleDelete(exercise: ExerciseData) {
    setDeletingExercise(exercise);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingExercise(null);
  }

  // Group exercises by muscle group
  const grouped = exercises.reduce<Record<string, ExerciseData[]>>(
    (acc, exercise) => {
      const group = exercise.muscleGroup;
      if (!acc[group]) acc[group] = [];
      acc[group].push(exercise);
      return acc;
    },
    {}
  );

  const formatLabel = (value: string) =>
    value
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("exercises.title")}</h1>
          <p className="text-muted-foreground">
            {t("exercises.countInLibrary", { count: exercises.length })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <Link
            href={ROUTES.exercisesUsage}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <TrendingUp className="h-4 w-4" />
            {t("exercises.usageLink")}
          </Link>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("exercises.newExercise")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="h-16 animate-pulse bg-muted/50" />
            </Card>
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ListChecks className="h-12 w-12 text-muted-foreground/50" />
            <CardHeader className="text-center">
              <CardTitle className="text-lg">{t("exercises.noExercises")}</CardTitle>
            </CardHeader>
            <p className="text-sm text-muted-foreground">
              {t("exercises.noExercisesHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, groupExercises]) => (
              <div key={group}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {formatLabel(group)} ({groupExercises.length})
                </h2>
                <div className="space-y-2">
                  {groupExercises.map((exercise) => (
                    <ExerciseCard
                      key={exercise.id}
                      exercise={exercise}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
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

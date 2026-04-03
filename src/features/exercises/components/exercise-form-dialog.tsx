"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from "@/lib/constants";
import { createExerciseSchema } from "../schemas";
import type { ExerciseData } from "./exercise-card";
import { useI18n } from "@/lib/i18n-provider";

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ExerciseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise?: ExerciseData | null;
  onSuccess: () => void;
}

export function ExerciseFormDialog({
  open,
  onOpenChange,
  exercise,
  onSuccess,
}: ExerciseFormDialogProps) {
  const { t } = useI18n();
  const isEditing = !!exercise;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      muscleGroup: formData.get("muscleGroup") as string,
      equipment: formData.get("equipment") as string,
      notes: (formData.get("notes") as string) || "",
    };

    const parsed = createExerciseSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setLoading(false);
      return;
    }

    const url = isEditing ? `/api/exercises/${exercise.id}` : "/api/exercises";
    const method = isEditing ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || t("exercises.formGenericError"));
      setLoading(false);
      return;
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("exercises.editExercise") : t("exercises.newExercise")}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t("exercises.formEditDesc") : t("exercises.formCreateDesc")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{t("exercises.formNameLabel")}</Label>
            <Input
              id="name"
              name="name"
              defaultValue={exercise?.name ?? ""}
              placeholder={t("exercises.formNamePlaceholder")}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="muscleGroup">{t("exercises.formMuscleGroup")}</Label>
              <select
                id="muscleGroup"
                name="muscleGroup"
                defaultValue={exercise?.muscleGroup ?? "CHEST"}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {MUSCLE_GROUPS.map((mg) => (
                  <option key={mg} value={mg}>
                    {formatLabel(mg)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment">{t("exercises.formEquipment")}</Label>
              <select
                id="equipment"
                name="equipment"
                defaultValue={exercise?.equipment ?? "BARBELL"}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {EQUIPMENT_TYPES.map((eq) => (
                  <option key={eq} value={eq}>
                    {formatLabel(eq)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("exercises.formNotesOptional")}</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={exercise?.notes ?? ""}
              placeholder={t("exercises.formNotesPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? isEditing
                  ? t("common.saving")
                  : t("exercises.formCreating")
                : isEditing
                  ? t("exercises.formSaveChanges")
                  : t("exercises.formCreateSubmit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

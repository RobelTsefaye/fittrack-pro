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
import type { ExerciseData } from "./exercise-card";
import { useI18n } from "@/lib/i18n-provider";

interface ExerciseDeleteDialogProps {
  exercise: ExerciseData | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ExerciseDeleteDialog({
  exercise,
  onClose,
  onSuccess,
}: ExerciseDeleteDialogProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!exercise) return;
    setLoading(true);

    await fetch(`/api/exercises/${exercise.id}`, { method: "DELETE" });

    setLoading(false);
    onClose();
    onSuccess();
  }

  return (
    <Dialog open={!!exercise} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("exercises.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("exercises.deleteDescription", { name: exercise?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? t("exercises.deleting") : t("common.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

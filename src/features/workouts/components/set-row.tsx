"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { cn } from "@/lib/utils";

interface SetData {
  id: string;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  isWarmup: boolean;
  isCompleted: boolean;
}

interface SetRowProps {
  set: SetData;
  workoutId: string;
  weightUnitLabel?: string;
  onUpdate: () => void;
  onComplete: () => void;
  disabled?: boolean;
  offlineHandlers?: {
    patchSet: (body: Record<string, unknown>, complete: boolean) => Promise<void>;
    deleteSet: () => Promise<void>;
  };
}

export function SetRow({
  set,
  workoutId,
  weightUnitLabel = "kg",
  onUpdate,
  onComplete,
  disabled,
  offlineHandlers,
}: SetRowProps) {
  const { t } = useI18n();
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [weight, setWeight] = useState(set.weight?.toString() ?? "");
  const [rpe, setRpe] = useState(set.rpe?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReps(set.reps?.toString() ?? "");
    setWeight(set.weight?.toString() ?? "");
    setRpe(set.rpe?.toString() ?? "");
  }, [set.id, set.reps, set.weight, set.rpe]);

  async function saveSet(complete = false) {
    setSaving(true);
    const data: Record<string, unknown> = {};
    if (reps) data.reps = parseInt(reps);
    if (weight) data.weight = parseFloat(weight);
    if (rpe) data.rpe = parseFloat(rpe);
    if (complete) data.isCompleted = true;

    if (offlineHandlers) {
      await offlineHandlers.patchSet(data, complete);
    } else {
      await fetch(`/api/workouts/${workoutId}/sets/${set.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
    }

    setSaving(false);
    if (complete) {
      onComplete();
    } else {
      onUpdate();
    }
  }

  async function deleteSet() {
    if (offlineHandlers) {
      await offlineHandlers.deleteSet();
    } else {
      await fetch(`/api/workouts/${workoutId}/sets/${set.id}`, {
        method: "DELETE",
        credentials: "include",
      });
    }
    onUpdate();
  }

  const inputClass =
    "h-11 min-h-11 w-full min-w-0 text-center text-base sm:h-7 sm:min-h-0 sm:text-sm";

  return (
    <div
      className={cn(
        "rounded-lg px-2 py-2 sm:px-2 sm:py-1.5",
        set.isCompleted ? "bg-green-500/10" : "bg-muted/50"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <span className="flex w-8 shrink-0 justify-center text-xs font-medium text-muted-foreground sm:w-6">
          {set.isWarmup ? (
            <Badge variant="outline" className="px-1 text-[10px]">
              {t("workouts.warmupBadge")}
            </Badge>
          ) : (
            set.setNumber
          )}
        </span>

        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 sm:flex sm:max-w-none sm:flex-none sm:gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder={weightUnitLabel}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={() => {
              if (weight !== (set.weight?.toString() ?? "")) saveSet();
            }}
            className={cn(inputClass, "sm:w-16")}
            disabled={set.isCompleted || disabled}
          />
          <Input
            type="number"
            inputMode="numeric"
            placeholder={t("workouts.repsPlaceholder")}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={() => {
              if (reps !== (set.reps?.toString() ?? "")) saveSet();
            }}
            className={cn(inputClass, "sm:w-16")}
            disabled={set.isCompleted || disabled}
          />
          <Input
            type="number"
            inputMode="decimal"
            placeholder={t("workouts.rpePlaceholder")}
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
            onBlur={() => {
              if (rpe !== (set.rpe?.toString() ?? "")) saveSet();
            }}
            className={cn(inputClass, "sm:w-14")}
            disabled={set.isCompleted || disabled}
            min="1"
            max="10"
            step="0.5"
          />
        </div>

        {!set.isCompleted && !disabled ? (
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => saveSet(true)}
              disabled={saving}
              className="h-11 w-11 text-green-600 hover:bg-green-500/10 hover:text-green-700 sm:h-7 sm:w-7"
            >
              <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={deleteSet}
              className="h-11 w-11 text-muted-foreground hover:text-destructive sm:h-7 sm:w-7"
            >
              <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3" />
            </Button>
          </div>
        ) : (
          <Check className="ml-auto h-5 w-5 shrink-0 text-green-600 sm:ml-0 sm:h-4 sm:w-4" />
        )}
      </div>
    </div>
  );
}

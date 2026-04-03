"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";

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
  /** When set, PATCH/DELETE go through local queue instead of the API (offline / local-ID workout). */
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
      });
    }
    onUpdate();
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
        set.isCompleted ? "bg-green-500/10" : "bg-muted/50"
      }`}
    >
      <span className="w-6 text-center text-xs font-medium text-muted-foreground">
        {set.isWarmup ? (
          <Badge variant="outline" className="text-[10px] px-1">
            {t("workouts.warmupBadge")}
          </Badge>
        ) : (
          set.setNumber
        )}
      </span>

      <Input
        type="number"
        placeholder={weightUnitLabel}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => { if (weight !== (set.weight?.toString() ?? "")) saveSet(); }}
        className="h-7 w-16 text-center text-sm"
        disabled={set.isCompleted || disabled}
      />

      <Input
        type="number"
        placeholder={t("workouts.repsPlaceholder")}
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => { if (reps !== (set.reps?.toString() ?? "")) saveSet(); }}
        className="h-7 w-16 text-center text-sm"
        disabled={set.isCompleted || disabled}
      />

      <Input
        type="number"
        placeholder={t("workouts.rpePlaceholder")}
        value={rpe}
        onChange={(e) => setRpe(e.target.value)}
        onBlur={() => { if (rpe !== (set.rpe?.toString() ?? "")) saveSet(); }}
        className="h-7 w-14 text-center text-sm"
        disabled={set.isCompleted || disabled}
        min="1"
        max="10"
        step="0.5"
      />

      {!set.isCompleted && !disabled ? (
        <>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => saveSet(true)}
            disabled={saving}
            className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={deleteSet}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      ) : (
        <Check className="h-4 w-4 text-green-600" />
      )}
    </div>
  );
}

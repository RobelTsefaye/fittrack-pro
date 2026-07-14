"use client";

import { memo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { cn } from "@/lib/utils";
import type { WorkoutSetData } from "@/features/workouts/workout-types";
import { hapticSetCompleted, hapticPersonalRecord } from "@/lib/native/haptics";

function parseLocaleDecimal(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function parseRepsInput(raw: string): number | null {
  const n = parseLocaleDecimal(raw);
  if (n == null) return null;
  const r = Math.round(n);
  if (r < 0 || r > 999) return null;
  return r;
}

interface SetRowProps {
  set: WorkoutSetData;
  workoutId: string;
  weightUnitLabel?: string;
  /** Allow editing weight/reps after set was marked complete (past session correction). */
  unlockCompleted?: boolean;
  /** Fallback when PATCH fails */
  onRefresh?: () => void;
  onComplete: () => void;
  disabled?: boolean;
  /** Shown under inputs (last session reference). */
  previousHint?: string | null;
  /** A conservative, user-applied next-set recommendation. */
  progressionSuggestion?: { hint: string; weight: number; reps: number } | null;
  /** Online: merge server set into parent state without full reload */
  onMergeSet?: (set: WorkoutSetData) => void;
  /** Online: remove set from parent state after DELETE */
  onRemoveSet?: () => void;
  offlineHandlers?: {
    patchSet: (body: Record<string, unknown>, complete: boolean) => Promise<void>;
    deleteSet: () => Promise<void>;
  };
}

export const SetRow = memo(function SetRow({
  set,
  workoutId,
  weightUnitLabel = "kg",
  unlockCompleted = false,
  onRefresh,
  onComplete,
  disabled,
  previousHint,
  progressionSuggestion,
  onMergeSet,
  onRemoveSet,
  offlineHandlers,
}: SetRowProps) {
  const { t } = useI18n();
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [weight, setWeight] = useState(set.weight?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  // Re-seed the inputs from props only when this row starts representing a
  // *different* set (id change) — not on every prop update. The active-workout
  // poll refreshes the `set` object every second; syncing on set.reps/set.weight
  // (the old effect) both tripped React 19's set-state-in-effect rule and, worse,
  // wiped out whatever the user was mid-typing each time a poll landed. Adjusting
  // state during render keyed on set.id is React's recommended pattern here.
  const [seededSetId, setSeededSetId] = useState(set.id);
  const [seededCompleted, setSeededCompleted] = useState(set.isCompleted);
  if (seededSetId !== set.id) {
    setSeededSetId(set.id);
    setSeededCompleted(set.isCompleted);
    setReps(set.reps?.toString() ?? "");
    setWeight(set.weight?.toString() ?? "");
  } else if (set.isCompleted && !seededCompleted && reps.trim() === "" && weight.trim() === "") {
    // A set logged elsewhere (the Watch, via its own direct PATCH — this
    // page only learns about it on the next poll) while this row was
    // already mounted with empty inputs, because the phone had never
    // logged this set itself, used to leave weight/reps blank here forever
    // despite the set now holding real values — the id never changed, so
    // the branch above never fired. Only resyncs when both inputs are
    // still blank, so it can never clobber something the phone user is
    // mid-typing here.
    setSeededCompleted(true);
    setReps(set.reps?.toString() ?? "");
    setWeight(set.weight?.toString() ?? "");
  }

  async function saveSet(
    complete = false,
    values: { weight?: number; reps?: number } = {}
  ) {
    // Safety net for the checkmark button's disabled state above — never
    // mark a set done with literally nothing entered, regardless of caller.
    const repsValue = values.reps?.toString() ?? reps;
    const weightValue = values.weight?.toString() ?? weight;
    if (complete && repsValue.trim() === "" && weightValue.trim() === "") return;
    setSaving(true);
    const data: Record<string, unknown> = {};
    const rN = parseRepsInput(repsValue);
    if (rN != null) data.reps = rN;
    const wN = parseLocaleDecimal(weightValue);
    if (wN != null) data.weight = wN;
    if (complete) data.isCompleted = true;

    if (offlineHandlers) {
      await offlineHandlers.patchSet(data, complete);
      setSaving(false);
      if (complete) {
        void hapticSetCompleted();
        onComplete();
      }
      return;
    }

    const res = await fetch(`/api/workouts/${workoutId}/sets/${set.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    setSaving(false);

    if (res.ok) {
      const json = (await res.json()) as {
        data?: WorkoutSetData;
        personalRecord?: boolean;
      };
      if (json.data) onMergeSet?.(json.data);
      if (complete) {
        if (json.personalRecord) {
          void hapticPersonalRecord();
        } else {
          void hapticSetCompleted();
        }
        onComplete();
      }
    } else {
      onRefresh?.();
    }
  }

  async function deleteSet() {
    if (offlineHandlers) {
      await offlineHandlers.deleteSet();
      return;
    }
    const res = await fetch(`/api/workouts/${workoutId}/sets/${set.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      onRemoveSet?.();
    } else {
      onRefresh?.();
    }
  }

  const inputClass =
    "h-11 min-h-11 w-full min-w-0 text-center text-base sm:h-7 sm:min-h-0 sm:text-sm";

  const inputsLocked =
    disabled || (set.isCompleted && !unlockCompleted);

  // Guards against completing a set with nothing entered — e.g. right after
  // the app relaunches mid-workout, these inputs seed from set.weight/reps
  // (still null if this set was never actually saved before), and a stray
  // tap on the checkmark used to silently mark it done with no data at all.
  const hasAnyValue = reps.trim() !== "" || weight.trim() !== "";

  function applyProgressionSuggestion() {
    if (!progressionSuggestion) return;
    setWeight(progressionSuggestion.weight.toString());
    setReps(progressionSuggestion.reps.toString());
    void saveSet(false, progressionSuggestion);
  }

  return (
    <div
      className={cn(
        "rounded-lg px-2 py-2 transition-colors sm:px-2 sm:py-1.5",
        set.isCompleted
          ? "dark:bg-primary/8 dark:ring-1 dark:ring-primary/20 bg-green-500/10 ring-1 ring-green-500/20"
          : "bg-muted/50"
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

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:max-w-none sm:flex-none sm:gap-2">
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={weightUnitLabel}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={() => {
              if (weight !== (set.weight?.toString() ?? "")) saveSet(false);
            }}
            className={cn(inputClass, "sm:w-20")}
            disabled={inputsLocked}
          />
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("workouts.repsPlaceholder")}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={() => {
              if (reps !== (set.reps?.toString() ?? "")) saveSet(false);
            }}
            className={cn(inputClass, "sm:w-20")}
            disabled={inputsLocked}
          />
        </div>

        {!set.isCompleted && !disabled ? (
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => saveSet(true)}
              disabled={saving || !hasAnyValue}
              className="h-11 w-11 sm:h-7 sm:w-7 text-primary hover:bg-primary/10"
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
              <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </div>
        ) : (
          <Check className="ml-auto h-5 w-5 shrink-0 text-primary sm:ml-0 sm:h-4 sm:w-4" />
        )}
      </div>
      {previousHint ? (
        <p className="mt-1.5 pl-8 text-[11px] leading-tight text-muted-foreground/90 sm:pl-6">
          {previousHint}
        </p>
      ) : null}
      {progressionSuggestion && !set.isCompleted && !disabled ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 pl-8 sm:pl-6">
          <p className="text-[11px] leading-tight text-muted-foreground/90">
            {progressionSuggestion.hint}
          </p>
          <Button type="button" variant="ghost" size="xs" onClick={applyProgressionSuggestion}>
            {t("workouts.applySuggestion")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}, (prev, next) =>
  prev.set.id === next.set.id &&
  prev.set.isCompleted === next.set.isCompleted &&
  prev.set.weight === next.set.weight &&
  prev.set.reps === next.set.reps &&
  prev.set.setNumber === next.set.setNumber &&
  prev.set.isWarmup === next.set.isWarmup &&
  prev.disabled === next.disabled &&
  prev.previousHint === next.previousHint &&
  prev.progressionSuggestion?.hint === next.progressionSuggestion?.hint &&
  prev.progressionSuggestion?.weight === next.progressionSuggestion?.weight &&
  prev.progressionSuggestion?.reps === next.progressionSuggestion?.reps &&
  prev.unlockCompleted === next.unlockCompleted &&
  // Track online↔offline transition so offlineHandlers are picked up
  !!prev.offlineHandlers === !!next.offlineHandlers
);

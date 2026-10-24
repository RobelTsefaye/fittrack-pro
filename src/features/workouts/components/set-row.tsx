"use client";

import { memo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WorkoutSetData } from "@/features/workouts/workout-types";
import { hapticSetCompleted, hapticPersonalRecord } from "@/lib/native/haptics";
import { perSideSummary } from "@/features/tools/plate-math";

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
  /** The next open set of its exercise: gets the quick-entry toolbar. */
  isNext?: boolean;
  /** Values of the set right above (same exercise, this workout). */
  prevSetValues?: { setNumber: number; weight: number | null; reps: number | null } | null;
  /** Show the per-side plate breakdown (barbell exercises). */
  isBarbell?: boolean;
}

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
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
  isNext = false,
  prevSetValues,
  isBarbell = false,
}: SetRowProps) {
  const { t } = useI18n();
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [weight, setWeight] = useState(set.weight?.toString() ?? "");
  const [rpe, setRpe] = useState<number | null>(set.rpe ?? null);
  // Guards double-completion only. An in-flight save must NOT disable the checkmark:
  // tapping it while an input is focused first fires that input's blur
  // save, which would disable the button before its click lands — the tap
  // was silently lost and users had to tap twice.
  const completingRef = useRef(false);
  // Saves can now overlap (blur save + completion). Only the newest
  // request's response may be merged, so a slower plain save can't revert
  // a just-completed set to "not done".
  const saveSeqRef = useRef(0);

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
    setRpe(set.rpe ?? null);
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
    if (complete) {
      if (completingRef.current) return;
      completingRef.current = true;
    }
    try {
      await persistSet(complete, repsValue, weightValue);
    } finally {
      if (complete) completingRef.current = false;
    }
  }

  async function persistSet(complete: boolean, repsValue: string, weightValue: string) {
    const data: Record<string, unknown> = {};
    const rN = parseRepsInput(repsValue);
    if (rN != null) data.reps = rN;
    const wN = parseLocaleDecimal(weightValue);
    if (wN != null) data.weight = wN;
    // Send RPE only when it changed, including clearing it (null).
    if (rpe !== (set.rpe ?? null)) data.rpe = rpe;
    if (complete) data.isCompleted = true;

    if (offlineHandlers) {
      await offlineHandlers.patchSet(data, complete);
      if (complete) {
        void hapticSetCompleted();
        onComplete();
      }
      return;
    }

    const seq = ++saveSeqRef.current;
    let res: Response;
    try {
      res = await fetch(`/api/workouts/${workoutId}/sets/${set.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
    } catch {
      // Network dropped while navigator.onLine still claims online.
      if (complete) toast.error(t("common.saveFailed"));
      onRefresh?.();
      return;
    }

    if (res.ok) {
      const json = (await res.json()) as {
        data?: WorkoutSetData;
        personalRecord?: boolean;
      };
      if (json.data && seq === saveSeqRef.current) onMergeSet?.(json.data);
      if (complete) {
        if (json.personalRecord) {
          void hapticPersonalRecord();
          toast.success(t("workouts.newPrToast"), {
            description: t("workouts.newPrToastDesc", {
              weight: json.data?.weight ?? "",
              unit: weightUnitLabel,
              reps: json.data?.reps ?? "",
            }),
          });
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

  const showToolbar = isNext && !set.isCompleted && !disabled && !inputsLocked;
  const isLb = weightUnitLabel === "lb";
  const weightStep = isLb ? 5 : 2.5;

  /** Base for a stepper tap: what's typed, else the suggestion, else the set above. */
  function bumpWeight(delta: number) {
    const base =
      parseLocaleDecimal(weight) ?? progressionSuggestion?.weight ?? prevSetValues?.weight ?? 0;
    const next = Math.max(0, base + delta);
    setWeight(formatNumber(next));
    void saveSet(false, { weight: next });
  }
  function bumpReps(delta: number) {
    const base = parseRepsInput(reps) ?? progressionSuggestion?.reps ?? prevSetValues?.reps ?? 0;
    const next = Math.max(0, base + delta);
    setReps(String(next));
    void saveSet(false, { reps: next });
  }
  function copyPrevSet() {
    if (!prevSetValues) return;
    if (prevSetValues.weight != null) setWeight(formatNumber(prevSetValues.weight));
    if (prevSetValues.reps != null) setReps(String(prevSetValues.reps));
    void saveSet(false, {
      ...(prevSetValues.weight != null ? { weight: prevSetValues.weight } : {}),
      ...(prevSetValues.reps != null ? { reps: prevSetValues.reps } : {}),
    });
  }
  const plates =
    showToolbar && isBarbell ? perSideSummary(parseLocaleDecimal(weight) ?? 0, isLb ? "LB" : "KG") : null;
  const chip =
    "inline-flex h-9 min-w-0 items-center justify-center gap-0.5 rounded-xl bg-[var(--sys-fill)] text-[13px] font-semibold tabular-nums text-foreground transition-colors active:bg-primary/25";
  const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const stepLabel = numberFmt.format(weightStep);

  return (
    <div
      className={cn(
        "rounded-lg px-2 py-2 transition-colors sm:px-2 sm:py-1.5",
        showToolbar && "ring-1 ring-primary/30",
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

        <div className="grid min-w-0 flex-1 grid-cols-2 items-start gap-2 sm:flex sm:max-w-none sm:flex-none sm:gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
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
          {showToolbar ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={chip} onClick={() => bumpWeight(-weightStep)} aria-label={t("workouts.weightDown")}>
                <Minus className="h-3.5 w-3.5" />
                {stepLabel}
              </button>
              <button type="button" className={chip} onClick={() => bumpWeight(weightStep)} aria-label={t("workouts.weightUp")}>
                <Plus className="h-3.5 w-3.5" />
                {stepLabel}
              </button>
            </div>
          ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
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
          {showToolbar ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={chip} onClick={() => bumpReps(-1)} aria-label={t("workouts.repsDown")}>
                <Minus className="h-3.5 w-3.5" />1
              </button>
              <button type="button" className={chip} onClick={() => bumpReps(1)} aria-label={t("workouts.repsUp")}>
                <Plus className="h-3.5 w-3.5" />1
              </button>
            </div>
          ) : null}
          </div>
        </div>

        {!set.isCompleted && !disabled ? (
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => saveSet(true)}
              disabled={!hasAnyValue}
              aria-label={t("workouts.completeSetAria", { n: set.setNumber })}
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
              aria-label={t("workouts.deleteSetAria", { n: set.setNumber })}
            >
              <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </div>
        ) : (
          <Check className="ml-auto h-5 w-5 shrink-0 text-primary sm:ml-0 sm:h-4 sm:w-4" />
        )}
      </div>
      {showToolbar ? (
        <div className="mt-2 space-y-2 pl-8 sm:pl-6">
          {prevSetValues && (prevSetValues.weight != null || prevSetValues.reps != null) ? (
              <button
                type="button"
                className="h-9 rounded-full bg-primary/10 px-3 text-[13px] font-medium text-primary transition-colors active:bg-primary/25"
                onClick={copyPrevSet}
              >
                {t("workouts.sameAsSet", {
                  n: prevSetValues.setNumber,
                  weight: prevSetValues.weight != null ? numberFmt.format(prevSetValues.weight) : "–",
                  reps: prevSetValues.reps ?? "–",
                })}
              </button>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" title={t("workouts.rpeHint")}>
              {t("workouts.rpe")}
            </span>
            {RPE_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={rpe === value}
                onClick={() => setRpe((current) => (current === value ? null : value))}
                className={cn(
                  "h-8 w-8 rounded-full text-[12px] font-semibold tabular-nums transition-colors",
                  rpe === value ? "bg-primary text-primary-foreground" : "bg-[var(--sys-fill)] text-muted-foreground"
                )}
              >
                {value}
              </button>
            ))}
          </div>
          {plates ? (
            <p className="text-[12px] text-muted-foreground">{t("workouts.platesPerSide", { plates })}</p>
          ) : null}
        </div>
      ) : null}
      {previousHint || progressionSuggestion ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-8 sm:pl-6">
          {previousHint ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
              {previousHint}
            </span>
          ) : null}
          {progressionSuggestion && !set.isCompleted && !disabled ? (
            <button
              type="button"
              onClick={applyProgressionSuggestion}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {progressionSuggestion.hint}
            </button>
          ) : null}
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
  prev.isNext === next.isNext &&
  prev.isBarbell === next.isBarbell &&
  prev.prevSetValues?.weight === next.prevSetValues?.weight &&
  prev.prevSetValues?.reps === next.prevSetValues?.reps &&
  prev.prevSetValues?.setNumber === next.prevSetValues?.setNumber &&
  // Track online↔offline transition so offlineHandlers are picked up
  !!prev.offlineHandlers === !!next.offlineHandlers
);

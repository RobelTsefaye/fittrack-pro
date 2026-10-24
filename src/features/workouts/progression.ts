import type { PreviousSetEntry } from "./previous-logs-types";

export type ProgressionSuggestion = {
  setIndex: number;
  weight: number;
  reps: number;
  kind: "increase" | "hold";
};

/** Target rep range from the plan, e.g. 6–8. */
export type RepRange = { min: number; max: number };

function increment(weightUnit: "KG" | "LB") {
  return weightUnit === "LB" ? 5 : 2.5;
}

/**
 * Returns the user's next working set from their last completed set.
 * Without a rep range this keeps the original rule: add weight once the
 * first set reaches 5 reps / later sets reach 10. With a range, see
 * suggestProgression (double progression).
 */
export function nextWorkingSet(
  previous: PreviousSetEntry,
  weightUnit: "KG" | "LB",
  setIndex = 0
): Omit<ProgressionSuggestion, "setIndex"> | null {
  if (previous.weight == null || previous.reps == null) return null;
  const increase = previous.reps >= (setIndex === 0 ? 5 : 10);
  return {
    weight: previous.weight + (increase ? increment(weightUnit) : 0),
    reps: previous.reps,
    kind: increase ? "increase" : "hold",
  };
}

/**
 * Produces one next-set recommendation per set of the latest session.
 *
 * With a rep range (double progression): once every logged working set
 * reached the top of the range, all sets go up one increment and restart at
 * the bottom of the range; otherwise the weight stays and each set aims for
 * one more rep (capped at the top).
 */
export function suggestProgression(
  sessions: PreviousSetEntry[][],
  weightUnit: "KG" | "LB",
  range?: RepRange | null
): ProgressionSuggestion[] {
  const latest = sessions[0];
  if (!latest) return [];

  if (!range) {
    const suggestions: ProgressionSuggestion[] = [];
    for (const [setIndex, previous] of latest.entries()) {
      const next = nextWorkingSet(previous, weightUnit, setIndex);
      if (next) suggestions.push({ setIndex, ...next });
    }
    return suggestions;
  }

  const logged = latest.filter((s) => s.weight != null && s.reps != null);
  const allAtTop = logged.length > 0 && logged.every((s) => s.reps! >= range.max);
  const suggestions: ProgressionSuggestion[] = [];
  for (const [setIndex, previous] of latest.entries()) {
    if (previous.weight == null || previous.reps == null) continue;
    suggestions.push(
      allAtTop
        ? { setIndex, weight: previous.weight + increment(weightUnit), reps: range.min, kind: "increase" }
        : {
            setIndex,
            weight: previous.weight,
            reps: Math.min(range.max, Math.max(range.min, previous.reps + 1)),
            kind: "hold",
          }
    );
  }
  return suggestions;
}

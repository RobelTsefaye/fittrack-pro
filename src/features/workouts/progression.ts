import type { PreviousSetEntry } from "./previous-logs-types";

export type ProgressionSuggestion = {
  setIndex: number;
  weight: number;
  reps: number;
  kind: "increase" | "hold";
};

/** Returns the user's next working set from their last completed set. */
export function nextWorkingSet(
  previous: PreviousSetEntry,
  weightUnit: "KG" | "LB",
  setIndex = 0
): Omit<ProgressionSuggestion, "setIndex"> | null {
  if (previous.weight == null || previous.reps == null) return null;
  const increment = weightUnit === "LB" ? 5 : 2.5;
  const increase = previous.reps >= (setIndex === 0 ? 5 : 10);
  return {
    weight: previous.weight + (increase ? increment : 0),
    reps: previous.reps,
    kind: increase ? "increase" : "hold",
  };
}

/** Produces one next-set recommendation from the latest completed session. */
export function suggestProgression(
  sessions: PreviousSetEntry[][],
  weightUnit: "KG" | "LB"
): ProgressionSuggestion[] {
  const latest = sessions[0];
  if (!latest) return [];
  const suggestions: ProgressionSuggestion[] = [];

  for (const [setIndex, previous] of latest.entries()) {
    const next = nextWorkingSet(previous, weightUnit, setIndex);
    if (next) suggestions.push({ setIndex, ...next });
  }

  return suggestions;
}

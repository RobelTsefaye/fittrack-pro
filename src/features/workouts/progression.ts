import type { PreviousSetEntry } from "./previous-logs-types";

export type ProgressionSuggestion = {
  setIndex: number;
  weight: number;
  reps: number;
  kind: "weight" | "reps";
};

/**
 * Produces deliberately conservative suggestions from the two latest
 * comparable completed sessions (newest first). The user always applies the
 * value explicitly; this function never changes a workout by itself.
 */
export function suggestProgression(
  sessions: PreviousSetEntry[][],
  weightUnit: "KG" | "LB"
): ProgressionSuggestion[] {
  if (sessions.length < 2) return [];
  const [latest, previous] = sessions;
  const increment = weightUnit === "LB" ? 5 : 2.5;
  const count = Math.min(latest.length, previous.length);
  const suggestions: ProgressionSuggestion[] = [];

  for (let setIndex = 0; setIndex < count; setIndex++) {
    const current = latest[setIndex];
    const prior = previous[setIndex];
    if (
      current.weight == null || current.reps == null ||
      prior.weight == null || prior.reps == null ||
      (current.rpe != null && current.rpe > 8) ||
      (prior.rpe != null && prior.rpe > 8)
    ) continue;

    // Two clean 8+ rep sessions at the same weight justify the smallest
    // available load jump. At lower reps, earn one more rep first.
    if (current.weight === prior.weight && current.reps >= 8 && prior.reps >= 8) {
      suggestions.push({
        setIndex,
        weight: current.weight + increment,
        reps: current.reps,
        kind: "weight",
      });
    } else if (current.weight === prior.weight && current.reps === prior.reps && current.reps < 8) {
      suggestions.push({
        setIndex,
        weight: current.weight,
        reps: current.reps + 1,
        kind: "reps",
      });
    }
  }

  return suggestions;
}

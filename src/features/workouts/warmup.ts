export type WarmupSetDraft = {
  weight: number;
  reps: number;
};

const RAMP = [
  { percentage: 0.5, reps: 8 },
  { percentage: 0.7, reps: 5 },
  { percentage: 0.85, reps: 3 },
] as const;

/** Builds a conservative three-set ramp for the first working weight. */
export function buildWarmupRamp(
  targetWeight: number,
  weightUnit: "KG" | "LB"
): WarmupSetDraft[] {
  if (!Number.isFinite(targetWeight) || targetWeight <= 0) return [];

  const increment = weightUnit === "LB" ? 5 : 2.5;
  return RAMP.map(({ percentage, reps }) => ({
    weight: Math.max(
      increment,
      Math.round((targetWeight * percentage) / increment) * increment
    ),
    reps,
  }));
}

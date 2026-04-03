/** Epley formula: estimated 1RM from a single set (reps ≥ 1). */
export function epley1RM(weight: number, reps: number): number {
  if (reps < 1 || weight <= 0) return 0;
  return weight * (1 + reps / 30);
}

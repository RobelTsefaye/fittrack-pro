/** Warmup sets first, then by set number (handles legacy ordering). */
export function sortSetsForDisplay<T extends { setNumber: number; isWarmup: boolean }>(
  sets: T[]
): T[] {
  return [...sets].sort((a, b) => {
    if (a.isWarmup !== b.isWarmup) return a.isWarmup ? -1 : 1;
    return a.setNumber - b.setNumber;
  });
}

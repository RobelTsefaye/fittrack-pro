const DAY_MS = 86_400_000;

/**
 * Adds a trailing 7-day mean (`avg7`) to each weigh-in: the average of all
 * entries dated within the 7 days ending on that entry. Input must be sorted
 * by `date` (YYYY-MM-DD) ascending. Smooths out daily water swings.
 */
export function withSevenDayAverage<T extends { date: string; weight: number }>(
  points: T[]
): (T & { avg7: number })[] {
  return points.map((p, i) => {
    const end = Date.parse(`${p.date}T00:00:00Z`);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0; j--) {
      if (end - Date.parse(`${points[j]!.date}T00:00:00Z`) >= 7 * DAY_MS) break;
      sum += points[j]!.weight;
      n++;
    }
    return { ...p, avg7: Math.round((sum / n) * 10) / 10 };
  });
}

export type PlateResult<P extends { weight: number }> =
  | { type: "empty" }
  | { type: "bar-only" }
  | { type: "plates"; plates: { spec: P; count: number }[]; total: number }
  | { type: "not-achievable"; nearest: number };

export const KG_PLATE_WEIGHTS = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export const LB_PLATE_WEIGHTS = [45, 35, 25, 10, 5, 2.5] as const;
export const KG_BAR = 20;
export const LB_BAR = 45;

/**
 * Greedy per-side plate breakdown for a barbell. `specs` must be sorted
 * heaviest first; `count` is plates per side.
 */
export function calcPlates<P extends { weight: number }>(
  targetRaw: number,
  bar: number,
  specs: readonly P[]
): PlateResult<P> {
  if (!targetRaw || isNaN(targetRaw)) return { type: "empty" };
  const target = Math.round(targetRaw * 100) / 100;
  if (target <= 0) return { type: "empty" };
  if (target <= bar) return { type: "bar-only" };

  let remaining = Math.round(((target - bar) / 2) * 1000) / 1000;
  const buckets = new Map<number, number>();
  for (const spec of specs) {
    while (remaining >= spec.weight - 0.0005) {
      buckets.set(spec.weight, (buckets.get(spec.weight) ?? 0) + 1);
      remaining = Math.round((remaining - spec.weight) * 1000) / 1000;
    }
  }

  if (remaining > 0.001) {
    return { type: "not-achievable", nearest: Math.round((target - remaining * 2) * 100) / 100 };
  }

  const plates = Array.from(buckets.entries())
    .map(([w, count]) => ({ spec: specs.find((s) => s.weight === w)!, count }))
    .filter((p) => p.spec);
  const total = bar + plates.reduce((sum, p) => sum + p.spec.weight * p.count * 2, 0);
  return { type: "plates", plates, total: Math.round(total * 100) / 100 };
}

/** "25 + 25 + 5" style per-side summary, or null when no plates apply. */
export function perSideSummary(target: number, unit: "KG" | "LB"): string | null {
  const weights = (unit === "LB" ? LB_PLATE_WEIGHTS : KG_PLATE_WEIGHTS).map((weight) => ({ weight }));
  const result = calcPlates(target, unit === "LB" ? LB_BAR : KG_BAR, weights);
  if (result.type !== "plates") return null;
  const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  return result.plates
    .flatMap((p) => Array.from({ length: p.count }, () => fmt.format(p.spec.weight)))
    .join(" + ");
}

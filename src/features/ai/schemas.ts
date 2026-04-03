/** Clamp `weeks` query param for AI endpoints. */
export function clampWeeks(raw: string | null, fallback: number, max: number) {
  const n = raw ? parseInt(raw, 10) : fallback;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(1, n));
}

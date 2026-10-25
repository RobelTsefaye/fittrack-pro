/**
 * A colour per training split, so a session reads at a glance (as the areas do in
 * Nexus): push warm, pull cool, legs green… Anything else gets a stable colour
 * from its name.
 */
const SPLITS: Array<[RegExp, string]> = [
  [/push|brust|chest/i, "#FF8A4C"],
  [/pull|rücken|ruecken|back/i, "#4CC2FF"],
  [/leg|bein|lower|unterk/i, "#7CE07A"],
  [/upper|oberk/i, "#B48CFF"],
  [/full|ganzk/i, "#FF6B9A"],
  [/cardio|lauf|run|rad|bike|swim/i, "#FF5A5F"],
  [/arm|schulter|shoulder/i, "#FFD24C"],
];
const FALLBACK = ["#4CC2FF", "#B48CFF", "#FFD24C", "#7CE07A", "#FF8A4C", "#FF6B9A"];

export function splitHue(name: string | null | undefined): string {
  const n = name ?? "";
  const hit = SPLITS.find(([re]) => re.test(n));
  if (hit) return hit[1];
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

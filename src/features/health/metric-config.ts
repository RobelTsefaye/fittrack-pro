import type { HealthSnapshot } from "./types";

export type MetricSlug =
  | "sleep" | "resting-hr" | "hrv" | "steps"
  | "active-calories" | "exercise-minutes" | "vo2-max" | "water";

export type MetricConfig = {
  slug: MetricSlug;
  field: keyof HealthSnapshot;
  label: string;
  unit: string;
  color: string;
  /** higher value = better outcome (lower for restingHR) */
  betterDirection: "higher" | "lower";
  format: (v: number) => string;
  /** integer or one-decimal precision */
  decimals: 0 | 1;
};

export const METRICS: Record<MetricSlug, MetricConfig> = {
  sleep: {
    slug: "sleep",
    field: "sleepDuration",
    label: "Schlaf",
    unit: "Std.",
    color: "#6E5BFF",
    betterDirection: "higher",
    format: (v) => v.toFixed(1),
    decimals: 1,
  },
  "resting-hr": {
    slug: "resting-hr",
    field: "restingHeartRate",
    label: "Ruhepuls",
    unit: "bpm",
    color: "#FF453A",
    betterDirection: "lower",
    format: (v) => Math.round(v).toString(),
    decimals: 0,
  },
  hrv: {
    slug: "hrv",
    field: "hrv",
    label: "HRV",
    unit: "ms",
    color: "#30D158",
    betterDirection: "higher",
    format: (v) => Math.round(v).toString(),
    decimals: 0,
  },
  steps: {
    slug: "steps",
    field: "steps",
    label: "Schritte",
    unit: "",
    color: "#D4FF3A",
    betterDirection: "higher",
    format: (v) => Math.round(v).toLocaleString("de-DE"),
    decimals: 0,
  },
  "active-calories": {
    slug: "active-calories",
    field: "activeCalories",
    label: "Aktive Kalorien",
    unit: "kcal",
    color: "#FF9F0A",
    betterDirection: "higher",
    format: (v) => Math.round(v).toString(),
    decimals: 0,
  },
  "exercise-minutes": {
    slug: "exercise-minutes",
    field: "exerciseMinutes",
    label: "Training",
    unit: "min",
    color: "#FFB340",
    betterDirection: "higher",
    format: (v) => Math.round(v).toString(),
    decimals: 0,
  },
  "vo2-max": {
    slug: "vo2-max",
    field: "vo2Max",
    label: "VO₂ Max",
    unit: "ml/kg/min",
    color: "#64D2FF",
    betterDirection: "higher",
    format: (v) => v.toFixed(1),
    decimals: 1,
  },
  water: {
    slug: "water",
    field: "water",
    label: "Wasser",
    unit: "L",
    color: "#0A84FF",
    betterDirection: "higher",
    format: (v) => (v / 1000).toFixed(1),
    decimals: 1,
  },
};

export const METRIC_SLUGS = Object.keys(METRICS) as MetricSlug[];

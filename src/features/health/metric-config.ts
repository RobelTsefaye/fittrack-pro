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
  /** short explainer shown on the detail page */
  description: string;
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
    description:
      "Schlafdauer pro Nacht. Während der Tiefschlafphase werden Wachstumshormone ausgeschüttet, Muskelgewebe repariert und das Nervensystem regeneriert. 7–9 Stunden gelten für Erwachsene als optimal für Erholung und Leistungsfähigkeit.",
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
    description:
      "Herzschläge pro Minute in vollständiger Ruhe. Ein niedriger Ruhepuls (50–70 bpm) deutet auf ein gut trainiertes Herz hin. Anstiege über mehrere Tage können auf Stress, Übertraining oder beginnende Krankheit hinweisen.",
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
    description:
      "Herzratenvariabilität — die Schwankung der zeitlichen Abstände zwischen einzelnen Herzschlägen in Millisekunden. Höhere Werte zeigen ein gut erholtes, anpassungsfähiges Nervensystem. Sinkt die HRV über mehrere Tage, ist das ein frühes Signal für Übertraining oder erhöhten Stress.",
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
    description:
      "Tägliche Schrittzahl als Maß für alltägliche Bewegung. 7.000–10.000 Schritte sind mit deutlich reduziertem Risiko für Herz-Kreislauf-Erkrankungen assoziiert. Hilfreich als zusätzlicher Aktivitätsindikator neben dem Training.",
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
    description:
      "Durch Bewegung verbrannte Kalorien — also alles, was über deinen Grundumsatz hinausgeht. Spiegelt deine tatsächliche körperliche Aktivität wider und ergänzt die Schrittzahl, da auch Krafttraining und intensive Workouts berücksichtigt werden.",
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
    description:
      "Minuten mit erhöhter Herzfrequenz (mindestens auf Spaziergangs-Niveau). Die WHO empfiehlt 150 Minuten pro Woche moderate oder 75 Minuten intensive Bewegung. Apple zählt 30 Minuten pro Tag als Standardziel.",
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
    description:
      "Maximale Sauerstoffaufnahme pro Minute und Kilogramm Körpergewicht — der wissenschaftliche Goldstandard für kardiorespiratorische Fitness. Höhere Werte korrelieren mit besserer Ausdauer und niedrigerem Mortalitätsrisiko. Verändert sich nur langsam über Wochen und Monate.",
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
    description:
      "Tägliche Flüssigkeitsaufnahme. Bereits leichte Dehydrierung (1–2% Körpergewicht) reduziert Konzentration und körperliche Leistung. Empfehlung: ca. 30–35 ml pro kg Körpergewicht, mehr bei intensivem Training.",
  },
};

export const METRIC_SLUGS = Object.keys(METRICS) as MetricSlug[];

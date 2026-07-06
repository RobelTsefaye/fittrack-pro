import type { HealthSnapshot } from "./types";

export type MetricSlug =
  | "sleep" | "resting-hr" | "hrv" | "steps"
  | "active-calories" | "exercise-minutes" | "vo2-max" | "water"
  | "respiratory-rate" | "wrist-temperature";

/**
 * Reference band on an athlete-targeted scale.
 * Values in raw storage units (mL for water, hours for sleep, etc.).
 * A value v belongs to the band when (min == null || v >= min) && (max == null || v < max).
 * Bands MUST be defined in ascending order of `min`, with min=null only on the first
 * band and max=null only on the last.
 */
export type ScaleBand = {
  min: number | null;
  max: number | null;
  label: string;
  color: string;
};

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
  /**
   * Athlete-targeted reference scale (not general-population norms).
   * Omitted for metrics where the absolute value has no universal good/bad
   * interpretation (e.g. wrist temperature, which only matters as a personal
   * deviation) — the detail page then relies on the description instead.
   */
  athleteScale?: ScaleBand[];
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
    athleteScale: [
      { min: null, max: 6,   label: "Schlafmangel — Recovery-Defizit",       color: "#FF453A" },
      { min: 6,    max: 7,   label: "Zu wenig für harten Trainingsbetrieb",  color: "#FF9F0A" },
      { min: 7,    max: 8,   label: "Solide — Mindestziel für Sportler",      color: "#FFB340" },
      { min: 8,    max: 9,   label: "Optimal für Athleten",                   color: "#30D158" },
      { min: 9,    max: null,label: "Premium — ideal in intensiven Phasen",   color: "#D4FF3A" },
    ],
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
    athleteScale: [
      { min: null, max: 40, label: "Elite-Ausdauer",                      color: "#D4FF3A" },
      { min: 40,   max: 50, label: "Sehr gut trainiert",                  color: "#30D158" },
      { min: 50,   max: 60, label: "Gut trainiert",                       color: "#FFB340" },
      { min: 60,   max: 70, label: "Durchschnitt — unter Sportler-Niveau", color: "#FF9F0A" },
      { min: 70,   max: null,label: "Hoch — Stress, Übertraining oder untrainiert", color: "#FF453A" },
    ],
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
    athleteScale: [
      { min: null, max: 30,  label: "Niedrig — Stress oder Erschöpfung",    color: "#FF453A" },
      { min: 30,   max: 50,  label: "Unter Sportler-Niveau",                color: "#FF9F0A" },
      { min: 50,   max: 70,  label: "Gut trainiert",                        color: "#FFB340" },
      { min: 70,   max: 100, label: "Sehr gut erholt",                      color: "#30D158" },
      { min: 100,  max: null,label: "Exzellent — Elite-Bereich",            color: "#D4FF3A" },
    ],
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
    athleteScale: [
      { min: null,  max: 5000,  label: "Sehr inaktiv — auch für Ruhetag wenig", color: "#FF453A" },
      { min: 5000,  max: 8000,  label: "Aktiver Ruhetag",                       color: "#FFB340" },
      { min: 8000,  max: 12000, label: "Solider Aktivitätstag",                 color: "#30D158" },
      { min: 12000, max: 15000, label: "Sehr aktiv — typischer Sportler-Tag",   color: "#D4FF3A" },
      { min: 15000, max: null,  label: "Hoch — Wettkampf- oder Outdoor-Tag",    color: "#64D2FF" },
    ],
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
    athleteScale: [
      { min: null, max: 300,  label: "Sehr niedrig — kompletter Ruhetag",      color: "#FF453A" },
      { min: 300,  max: 600,  label: "Leichter Tag oder Aktive Erholung",      color: "#FFB340" },
      { min: 600,  max: 900,  label: "Solider Trainingstag",                   color: "#30D158" },
      { min: 900,  max: 1200, label: "Intensiver Tag — typisch für Sportler",  color: "#D4FF3A" },
      { min: 1200, max: null, label: "Sehr hoch — harter Workout-Tag",         color: "#64D2FF" },
    ],
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
    athleteScale: [
      { min: null, max: 30,  label: "Unter Empfehlung",                       color: "#FF453A" },
      { min: 30,   max: 60,  label: "WHO-Mindestmaß",                          color: "#FFB340" },
      { min: 60,   max: 90,  label: "Solides Trainingsvolumen",                color: "#30D158" },
      { min: 90,   max: 120, label: "Sportler-Niveau",                         color: "#D4FF3A" },
      { min: 120,  max: null,label: "Sehr hoch — Wettkampfvorbereitung",       color: "#64D2FF" },
    ],
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
      "Maximale Sauerstoffaufnahme pro Minute und Kilogramm Körpergewicht — der wissenschaftliche Goldstandard für kardiorespiratorische Fitness. Höhere Werte korrelieren mit besserer Ausdauer und niedrigerem Mortalitätsrisiko. Verändert sich nur langsam über Wochen und Monate. Werte sind alters- und geschlechtsabhängig — die Skala unten ist für trainierte Erwachsene.",
    athleteScale: [
      { min: null, max: 35, label: "Niedrig — Trainingsbedarf",        color: "#FF453A" },
      { min: 35,   max: 45, label: "Durchschnitt",                     color: "#FF9F0A" },
      { min: 45,   max: 55, label: "Gut trainiert",                    color: "#FFB340" },
      { min: 55,   max: 65, label: "Sportler-Niveau",                  color: "#30D158" },
      { min: 65,   max: null,label: "Elite-Bereich",                   color: "#D4FF3A" },
    ],
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
    athleteScale: [
      { min: null, max: 1500, label: "Zu wenig — Dehydrierungs-Risiko",       color: "#FF453A" },
      { min: 1500, max: 2500, label: "Standard-Empfehlung",                   color: "#FFB340" },
      { min: 2500, max: 3500, label: "Sportler-Niveau",                       color: "#30D158" },
      { min: 3500, max: 5000, label: "Optimal bei intensivem Training",       color: "#D4FF3A" },
      { min: 5000, max: null, label: "Sehr hoch — Wettkampf oder Heißwetter", color: "#64D2FF" },
    ],
  },
  "respiratory-rate": {
    slug: "respiratory-rate",
    field: "respiratoryRate",
    label: "Atemfrequenz",
    unit: "/min",
    color: "#64D2FF",
    betterDirection: "lower",
    format: (v) => v.toFixed(1),
    decimals: 1,
    description:
      "Atemzüge pro Minute, nachts im Schlaf gemessen. In Ruhe ist die Atemfrequenz sehr stabil — ein erholter Körper atmet ruhig und gleichmäßig. Steigt der Wert mehrere Nächte über deine persönliche Baseline, ist das eines der frühesten Signale für einen beginnenden Infekt, Fieber oder Übertraining — oft bevor du dich überhaupt krank fühlst.",
    athleteScale: [
      { min: null, max: 12, label: "Sehr niedrig — ausgeprägte Ausdauerfitness", color: "#D4FF3A" },
      { min: 12,   max: 15, label: "Normal — gut erholt",                        color: "#30D158" },
      { min: 15,   max: 17, label: "Leicht erhöht",                              color: "#FFB340" },
      { min: 17,   max: 20, label: "Erhöht — Stress oder Infekt möglich",        color: "#FF9F0A" },
      { min: 20,   max: null, label: "Hoch — mögliches Krankheitssignal",        color: "#FF453A" },
    ],
  },
  "wrist-temperature": {
    slug: "wrist-temperature",
    field: "wristTemperature",
    label: "Handgelenk-Temperatur",
    unit: "°C",
    color: "#FF9F0A",
    betterDirection: "lower",
    format: (v) => v.toFixed(1),
    decimals: 1,
    description:
      "Hauttemperatur am Handgelenk, nachts im Schlaf gemessen (Apple Watch Series 8 und neuer). Der Absolutwert schwankt von Person zu Person stark und sagt allein wenig aus — entscheidend ist die Abweichung von deiner persönlichen Baseline. Ein Anstieg von mehr als +0,5 °C über mehrere Nächte deutet auf Infekt, Fieber, Zyklusphase, Alkohol oder Übertraining hin; Schwankungen von ±0,3 °C sind normal. Deine tatsächliche Abweichung siehst du auf der Recovery-Übersicht.",
    // No fixed good/bad scale: absolute wrist temperature is only meaningful
    // relative to the individual's own baseline.
  },
};

export const METRIC_SLUGS = Object.keys(METRICS) as MetricSlug[];

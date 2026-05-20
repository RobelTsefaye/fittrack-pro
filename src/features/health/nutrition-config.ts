/**
 * Daily targets for nutrition intake. These are sensible defaults for an
 * average adult — a future "Settings → Body Stats" page should personalize
 * them based on weight and goals.
 *
 * Sources:
 * - WHO / ISSN protein recommendations for active adults: 1.6 g/kg
 * - USDA RDA for vitamins/minerals
 * - 75 kg assumed body weight for protein/fat
 */

export type NutrientKey =
  | "dietaryCalories" | "protein" | "carbs" | "fat" | "fiber"
  | "sugar" | "sodium" | "caffeine" | "water"
  | "vitaminD" | "vitaminC" | "calcium" | "iron" | "potassium" | "magnesium";

export type NutrientTarget = {
  key: NutrientKey;
  label: string;
  unit: string;
  /** target daily amount (intake to reach or stay under) */
  target: number;
  /** "reach" = aim for ≥target, "limit" = stay ≤target */
  direction: "reach" | "limit";
  color: string;
  /** decimal places for display */
  decimals?: 0 | 1;
  /** brief description shown on the detail page */
  description?: string;
};

// Calorie target: a placeholder since real value depends on the user's
// deficit/surplus goal. 2200 = rough maintenance for ~75 kg adult.
export const CALORIE_TARGET_DEFAULT = 2200;

export const MACRO_TARGETS: NutrientTarget[] = [
  {
    key: "protein",
    label: "Protein",
    unit: "g",
    target: 120, // ~1.6 g/kg × 75 kg
    direction: "reach",
    color: "#FF453A",
    description: "Wichtig für Muskelerhalt und -aufbau, besonders im Kaloriendefizit. 1.6–2.2 g pro kg Körpergewicht für Sportler.",
  },
  {
    key: "carbs",
    label: "Kohlenhydrate",
    unit: "g",
    target: 275, // ~50% of 2200 kcal
    direction: "reach",
    color: "#FFB340",
    description: "Hauptbrennstoff für intensives Training. Im Defizit oft reduziert, aber für Leistung essentiell.",
  },
  {
    key: "fat",
    label: "Fett",
    unit: "g",
    target: 70, // ~28% of 2200 kcal
    direction: "reach",
    color: "#D4FF3A",
    description: "Wichtig für Hormonproduktion (Testosteron) und Aufnahme fettlöslicher Vitamine. Mindestens 0.8 g pro kg.",
  },
];

export const SECONDARY_TARGETS: NutrientTarget[] = [
  {
    key: "fiber",
    label: "Ballaststoffe",
    unit: "g",
    target: 30,
    direction: "reach",
    color: "#30D158",
    description: "Wichtig für Verdauung und Sättigung — besonders hilfreich im Kaloriendefizit.",
  },
  {
    key: "sugar",
    label: "Zucker",
    unit: "g",
    target: 50,
    direction: "limit",
    color: "#FF9F0A",
    description: "WHO empfiehlt ≤50 g zugesetzter Zucker pro Tag, idealerweise ≤25 g.",
  },
  {
    key: "sodium",
    label: "Natrium",
    unit: "mg",
    target: 2300,
    direction: "limit",
    color: "#64D2FF",
    description: "Wichtig für Elektrolytbalance, aber zu viel erhöht den Blutdruck. WHO-Limit: 2300 mg.",
  },
  {
    key: "water",
    label: "Wasser",
    unit: "ml",
    target: 2500,
    direction: "reach",
    color: "#0A84FF",
    decimals: 0,
    description: "30–35 ml pro kg Körpergewicht, mehr bei intensivem Training.",
  },
];

export const MICRO_TARGETS: NutrientTarget[] = [
  {
    key: "vitaminD",
    label: "Vitamin D",
    unit: "µg",
    target: 20,
    direction: "reach",
    color: "#FFB340",
    description: "Wichtig für Knochengesundheit und Immunsystem. Mangel ist im Winter sehr häufig.",
  },
  {
    key: "vitaminC",
    label: "Vitamin C",
    unit: "mg",
    target: 90,
    direction: "reach",
    color: "#FF9F0A",
    description: "Antioxidans, unterstützt Immunsystem und Kollagensynthese.",
  },
  {
    key: "calcium",
    label: "Kalzium",
    unit: "mg",
    target: 1000,
    direction: "reach",
    color: "#E8E8EE",
    description: "Knochengesundheit, Muskelkontraktion. RDA: 1000 mg für Erwachsene.",
  },
  {
    key: "iron",
    label: "Eisen",
    unit: "mg",
    target: 10,
    direction: "reach",
    color: "#FF453A",
    description: "Wichtig für Sauerstofftransport. RDA: 8 mg (Männer), 18 mg (prämenopausale Frauen).",
  },
  {
    key: "potassium",
    label: "Kalium",
    unit: "mg",
    target: 3500,
    direction: "reach",
    color: "#6E5BFF",
    description: "Elektrolyt, wichtig für Muskelkontraktion und Blutdruck-Regulation.",
  },
  {
    key: "magnesium",
    label: "Magnesium",
    unit: "mg",
    target: 400,
    direction: "reach",
    color: "#30D158",
    description: "Über 300 enzymatische Reaktionen, Energieproduktion, Muskelfunktion.",
  },
];

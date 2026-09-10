# Reverse Diet & Bulk Nutrition Plan (für Codex)

> **Codex:** Setzt diesen Plan phasenweise um, exakt wie unten spezifiziert. Keine Design-Entscheidungen treffen, die hier nicht bereits festgelegt sind — bei echter Unklarheit anhalten und fragen statt zu raten.
> **User (Robel):** Reviewt den Diff pro Phase, gibt lokal `npx prisma migrate dev` frei (DB-Schemaänderung), macht den finalen manuellen Klicktest laut Checkliste.

## Context

Aktuell sind Kalorien-/Makro-Ziele in [`src/features/health/nutrition-config.ts`](src/features/health/nutrition-config.ts) statisch (`CALORIE_TARGET_DEFAULT = 2200`, feste `MACRO_TARGETS`). Der Code kommentiert das selbst als Platzhalter ("real value depends on the user's deficit/surplus goal"). `nutrition-detail.tsx` hat bereits einen Stub `dynamicCarbTarget()`, der hart `275` zurückgibt — genau die Stelle, die dieses Feature ersetzt.

Ziel: ein **Wochenplan** (Phase + Startkalorien + wöchentlicher Kalorien-Schritt, Makros skaliert vom aktuellen Körpergewicht) ersetzt die statischen Werte, plus ein **7-Tage-Gewichtstrend**, der bei Abweichung vom erwarteten Verlauf einen Kalorien-Anpassungsvorschlag zeigt — den der Nutzer explizit bestätigen muss (kein stilles Automatisieren, siehe Architekturleitplanke #3 in `erstelle-absoluten-masterplan-der-nifty-reef.md`).

### Wichtige Fakten aus der Codebase-Analyse (nicht neu erfinden)

- **`BodyWeight`** — `prisma/schema.prisma:320-332`: `id, userId, weight: Float, date: DateTime @db.Date, notes: String?, createdAt`, unique `[userId, date]`, `@@map("body_weights")`. Kein Unit-Feld — Einheit kommt aus `UserSettings.weightUnit` (Enum `KG`/`LB`).
- **`UserSettings`** — `prisma/schema.prisma:142-160`: hat `weightUnit`, `theme`, `restTimerDefault`, `locale`, Kalender-Sync-Felder. Keine Kalorien-/Makro-/Ziel-Felder.
- **Keine Server Actions** im Repo (`grep -rl '"use server"' src` → leer). Alle Mutationen laufen über Route Handler unter `src/app/api/**/route.ts`, Zod-validiert, aufgerufen per `fetch`/`authenticatedFetch` vom Client.
- **Referenz-Route für Konventionen:** `src/app/api/body-weight/route.ts` — `resolveUserIdForDataApi()` für Auth, `parseDateOnlyUtc()` aus `src/lib/date-only.ts` für Datums-Parsing (400 statt 500 bei ungültigem Format), `revalidateTag(dashboardCacheTag(userId))` nach Mutation. Zod-Schema liegt in `src/features/tracking/schemas.ts` (`createBodyWeightSchema`).
- **Statische Konfig, die ersetzt wird:** `src/features/health/nutrition-config.ts:34-171` (`CALORIE_TARGET_DEFAULT`, `MACRO_TARGETS`, `SECONDARY_TARGETS`, `MICRO_TARGETS`). Nur die `.target`-Werte von `MACRO_TARGETS` (protein/carbs/fat) und `CALORIE_TARGET_DEFAULT` werden dynamisch — Label/Unit/Color/Description bleiben unverändert bestehen (weiter genutzt als Fallback + Metadaten).
- **Exakte Stub-Stelle:** `src/features/health/components/nutrition-detail.tsx:315-320` — `dynamicCarbTarget(snapshot)` gibt aktuell hart `275` zurück. Aufruf bei `nutrition-detail.tsx:187` in `MacroSection`. `CalorieBalance` nutzt `target = CALORIE_TARGET_DEFAULT` bei `nutrition-detail.tsx:107`.
- **Konsument Dashboard-Karte:** `src/features/health/components/nutrition-card.tsx` — gleiche Konstanten, kompaktere Darstellung.
- **Trend-Pattern zum Nachbauen:** `src/features/health/recovery.ts` — exportierte `async function get<Thing>(userId, ...)`, fragt Prisma direkt ab, komponiert aus privaten reinen Helfern (`median()`, `linearSlope()` — Least-Squares-Steigung), 14-Tage-Baseline-Fenster mit Mindest-Sample-Gating (≥7 bzw. ≥5 Tage), 3-Tage-Trendsteigung klassifiziert in `"rising"|"stable"|"falling"` über feste Schwellenwerte. Gleiches Muster in `src/services/muscle-heatmap.ts`.
- Aktuell berechnet **nichts im Repo** einen gleitenden 7-Tage-Durchschnitt für Körpergewicht — `src/features/tracking/components/body-weight-chart.tsx` plottet nur Rohwerte.
- **UI/Routing-Konvention:** Seiten unter `src/app/(app)/health/*` sind bewusst dünne `"use client"`-Wrapper **ohne** SSR-Prefetch (Kommentar in `nutrition/page.tsx` erklärt, warum `initialSnapshot={null}` vs. `undefined` Probleme machte) — Detail-Komponente lädt selbst, cache-first über `loadHealthCache`/`saveHealthCache` aus `src/lib/offline/screen-caches.ts`.
- **Settings-Konvention:** dünne Page + geteilte Section-Komponente, z.B. `src/app/(app)/settings/cardio/page.tsx` → `<CalendarSettingsSection kind="cardio" />`. Einstiegspunkte werden über `SettingsRow` in `src/app/(app)/settings/page.tsx` verlinkt (siehe dortige Liste: Preferences, Training, Cardio, Tokens, Export).
- **i18n:** kein eigener Top-Level-`nutrition`-Namespace — Strings liegen flach im bestehenden `health`-Objekt in `src/messages/en.json`/`de.json`, 1:1 gespiegelt.
- **`database-schema.md`** dokumentiert Tabellen im Format `Column | Type | Notes` + ASCII-Baumdiagramm oben (`User ├──* BodyWeight` etc.), **`api-routes.md`** im Format `Method | Route | Description` pro Domäne — beide sind bereits jetzt lückenhaft (kein `HealthSnapshot`, kein `BodyMeasurement`), werden hier nur um den neuen Teil ergänzt, nicht vollständig nachgezogen.
- Diese App hat eine iOS-Begleit-App (Capacitor/Watch) — **dieses Feature ist reines Web/DB**, keine nativen Dateien werden berührt. `npm run build:native` / `npx cap sync ios` sind **keine** Pflicht-Gates für diesen Plan.
- Kein Test-Setup existiert für `recovery.ts`-artige reine Funktionen (`find ... -iname "*.test.ts"` → keine Treffer im Health-Bereich) — keine Unit-Test-Pflicht, aber die reinen Funktionen sollen so geschrieben sein, dass sie später leicht testbar sind (kleine, seiteneffektfreie Funktionen mit klaren In-/Outputs).

### Produktentscheidungen (bereits getroffen, nicht erneut zur Diskussion stellen)

1. **Phasen:** `CUT | REVERSE_DIET | MAINTENANCE | BULK` (alle vier, nicht nur die zwei aktuell genutzten).
2. **Guardrails** (`minCalories`/`maxCalories`) sind **optional**, nicht Pflicht beim Anlegen eines Plans.
3. **Trend-Karte** erscheint **nur** auf der Ernährungs-Detailseite (`/health/nutrition`), nicht zusätzlich auf der Körpergewicht-Tracking-Seite.
4. **"Nicht jetzt"** auf einen Vorschlag ist **flüchtig** (kein persistiertes Dismiss-Tracking, kein neues Schema dafür).
5. **Plan-Speicherung:** History-Tabelle (mehrere Zeilen pro User, `endDate` schließt eine Phase), **nicht** eine einzige mutierbare Zeile — damit Phasenwechsel (Reverse Diet → Bulk) nachvollziehbar bleiben und der Trend über Phasengrenzen hinweg zurückblicken kann.
6. **Vorschlag annehmen** = neue `NutritionPlan`-Zeile ab heute anlegen (schließt die vorherige), **keine** stille Patch-Mutation der laufenden Zeile — das hält "Annehmen" strukturell auf denselben Pfad wie jedes andere Planerstellen (ein POST, ausgelöst durch einen expliziten Klick).
7. **Ziel-Wochenrate pro Phase** ist eine hartkodierte Konstante (Tabelle unten), kein editierbares Plan-Feld in v1 — einfach später per Konstanten-Änderung anpassbar, kein Schema-Bruch nötig.

## Globale Regeln für Codex

- Branch: `codex/reverse-diet-bulk-plan`. Niemals nach `main` mergen, niemals pushen ohne zu fragen.
- Pro Phase (unten) genau **ein Commit** mit conventional-commit-Prefix (`feat(nutrition-plan): ...`, `refactor(health): ...` etc.) und abschließender `Co-Authored-By`-Zeile.
- i18n-Keys **immer** in `src/messages/en.json` **und** `src/messages/de.json` gleichzeitig ergänzen (deutscher Text zuerst geschrieben, englischer Text sinngemäß, nicht wörtlich übersetzt wo unüblich).
- Nach jeder Phase: `npx tsc --noEmit` muss sauber durchlaufen, bevor committet wird.
- Kein `npm run build:native` / `npx cap sync ios` nötig (siehe oben) — nur `npm run build` am Ende (Gesamt-Verifikation).
- Bestehende statische Fallback-Werte (`CALORIE_TARGET_DEFAULT`, `MACRO_TARGETS[].target`) **nicht löschen** — sie bleiben der Fallback für Nutzer ohne aktiven Plan.
- Keine neuen Abhängigkeiten (Recharts, Zod, Prisma reichen für alles hier).

---

## Phase 1 — Schema

**Ändern:** `prisma/schema.prisma`

Neues Enum + Modell, platziert nach `BodyMeasurement` (nach Zeile ~353), vor `HealthSnapshot`:

```prisma
enum NutritionPhase {
  CUT
  REVERSE_DIET
  MAINTENANCE
  BULK
}

model NutritionPlan {
  id                String          @id @default(uuid())
  userId            String
  phase             NutritionPhase
  startDate         DateTime        @db.Date
  endDate           DateTime?       @db.Date   // null = aktueller/aktiver Plan
  startCalories     Int
  weeklyCalorieStep Int             @default(0)   // kcal/Woche, negativ bei CUT möglich
  minCalories       Int?
  maxCalories       Int?
  proteinPerKg      Float
  fatPerKg          Float
  notes             String?
  createdAt         DateTime        @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, startDate])
  @@map("nutrition_plans")
}
```

Zu `model User` (bei den bestehenden Relationen wie `bodyWeights BodyWeight[]`) hinzufügen: `nutritionPlans NutritionPlan[]`.

**Konvention (als Kommentar über dem Modell im Schema festhalten):** `endDate` ist exklusiv — bedeutet "ab diesem Datum nicht mehr aktiv". Beim Anlegen eines neuen Plans wird die vorherige offene Zeile (`endDate: null`) auf `endDate = neuerPlan.startDate` gesetzt.

**Invarianten in Anwendungscode (nicht als DB-Constraint):** höchstens eine Zeile pro `userId` mit `endDate IS NULL` gleichzeitig — durchgesetzt in der POST-Route aus Phase 3 (Transaktion: alte offene Zeile schließen, dann neue anlegen).

- `npx prisma migrate dev --name add_nutrition_plan` (lokal, User führt das aus — siehe Codex-vs-User-Split).

**Verifikation Phase 1:** `npx prisma generate` läuft ohne Fehler; `npx tsc --noEmit` sauber (neue generierte Typen vorhanden).

---

## Phase 2 — Geteilte Trend-Mathematik extrahieren

**Neu:** `src/lib/trend-math.ts`

Verschiebe (nicht dupliziere) diese drei Funktionen aus `src/features/health/recovery.ts` (aktuell privat, ca. Zeile 79-101):

```ts
export function median(values: number[]): number | null
export function linearSlope(values: number[]): number   // Least-Squares-Steigung, x = Index 0..n-1
export function clamp(v: number, min: number, max: number): number
```

`recovery.ts` importiert sie danach aus `@/lib/trend-math`, lokale Definitionen werden gelöscht. `interpolate()` und Anker-Tabellen bleiben lokal in `recovery.ts` (recovery-spezifisch, nicht teilen).

**Verifikation Phase 2:** `npx tsc --noEmit` sauber; `/health/recovery`-Seite lokal öffnen (`npm run dev`), Recovery Score erscheint unverändert zum Stand vor dem Refactor (gleiche Werte, da reine Verschiebung ohne Logikänderung).

---

## Phase 3 — Reine Berechnungsmodule + API-Routen für den Plan

**Neu:** `src/features/health/nutrition-plan-schemas.ts`

```ts
import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const createNutritionPlanSchema = z.object({
  phase: z.enum(["CUT", "REVERSE_DIET", "MAINTENANCE", "BULK"]),
  startDate: dateOnly,
  startCalories: z.number().int().min(800).max(6000),
  weeklyCalorieStep: z.number().int().min(-500).max(500).default(0),
  minCalories: z.number().int().min(800).max(6000).optional(),
  maxCalories: z.number().int().min(800).max(6000).optional(),
  proteinPerKg: z.number().positive().max(5),
  fatPerKg: z.number().positive().max(3),
  notes: z.string().max(500).optional(),
}).refine(
  (d) => !d.minCalories || !d.maxCalories || d.minCalories <= d.maxCalories,
  { message: "minCalories must be <= maxCalories" }
);
export type CreateNutritionPlanInput = z.infer<typeof createNutritionPlanSchema>;

// Für PATCH: gleiche Felder minus phase/startDate (History darf nicht rückwirkend verändert werden)
export const updateNutritionPlanSchema = createNutritionPlanSchema
  .innerType()
  .omit({ phase: true, startDate: true })
  .partial();
```

**Neu:** `src/features/health/nutrition-plan.ts` (Muster wie `recovery.ts`)

```ts
export type ActivePlan = {
  id: string;
  phase: "CUT" | "REVERSE_DIET" | "MAINTENANCE" | "BULK";
  startDate: Date;
  weeklyCalorieStep: number;
  minCalories: number | null;
  maxCalories: number | null;
  proteinPerKg: number;
  fatPerKg: number;
};

export type WeeklyTarget = {
  calories: number;              // nach Guardrail-Clamp
  rawCalories: number;           // vor Clamp, für UI-Transparenz
  weeksElapsed: number;
  protein: number;               // Gramm
  fat: number;                   // Gramm
  carbs: number;                 // Gramm, Rest nach Protein+Fett-kcal
  bodyWeightUsed: number | null; // kg
  isPersonalized: true;          // Marker, um Fallback-Objekt zu unterscheiden
};

export function weeksElapsedSince(startDate: Date, asOf: Date): number

export function computeWeeklyTarget(
  plan: ActivePlan,
  bodyWeightKg: number | null,
  asOf: Date
): WeeklyTarget

export async function getActivePlan(userId: string): Promise<ActivePlan | null>

// Holt aktiven Plan + letztes BodyWeight (in kg konvertiert via UserSettings.weightUnit),
// gibt null zurück wenn kein aktiver Plan existiert (Caller nutzt dann den statischen Fallback).
export async function getCurrentWeeklyTarget(userId: string): Promise<WeeklyTarget | null>
```

Makro-Formel in `computeWeeklyTarget`:

```
protein_g   = proteinPerKg * bodyWeightKg
fat_g       = fatPerKg * bodyWeightKg
proteinKcal = protein_g * 4
fatKcal     = fat_g * 9
rawCalories = startCalories + weeksElapsed * weeklyCalorieStep
calories    = clamp(rawCalories, minCalories ?? -Infinity, maxCalories ?? Infinity)
carbs_g     = max(0, calories - proteinKcal - fatKcal) / 4
```

`weeksElapsedSince`: `floor((asOf - startDate) / 7 Tage)`, minimal `0`.

**kg/lb-Konvertierung:** Prüfen, ob bereits ein Helper existiert (`grep -rn "lbToKg\|kgToLb" src/lib` — Stand der Recherche: **existiert noch nicht**). Neu anlegen in `src/lib/units.ts`: `export function lbToKg(lb: number): number` / `export function kgToLb(kg: number): number` (Faktor 0.45359237). `getCurrentWeeklyTarget` liest `UserSettings.weightUnit`; bei `LB` wird das letzte `BodyWeight.weight` vor der Makroberechnung nach kg konvertiert.

**Neu:** `src/app/api/nutrition-plan/route.ts`

- `GET`: `resolveUserIdForDataApi()`, 401 wenn kein User. Gibt zurück: `{ data: { active: NutritionPlanDTO | null, history: NutritionPlanDTO[] } }` — `history` = alle Zeilen des Users, `orderBy: { startDate: "desc" }`; `active` = Zeile mit `endDate: null` (oder `null`).
- `POST`: Body mit `createNutritionPlanSchema` validieren (400 bei Fehler). In `prisma.$transaction`: (1) offene Zeile (`endDate: null`) des Users suchen; falls vorhanden und `existing.startDate > parsed.startDate` → 400 ("neuer Plan muss am/nach Start des aktuellen Plans beginnen"); sonst `endDate = parsed.startDate` setzen; (2) neue Zeile anlegen. Response `{ data: NutritionPlanDTO }`, Status 201.

**Neu:** `src/app/api/nutrition-plan/[id]/route.ts`

- `PATCH`: nur für Korrekturen an der **aktuellen** Zeile ohne History-Verletzung — `phase`/`startDate` im Body werden abgelehnt (400), falls vorhanden. Ownership-Check `where: { id, userId }`, 404 wenn nicht gefunden/nicht eigene Zeile. Body via `updateNutritionPlanSchema`.

**Verifikation Phase 3:** `npx tsc --noEmit` sauber. Manueller Test: `curl -X POST localhost:3000/api/nutrition-plan` mit gültigem Body (angemeldete Session/Token) → 201, `GET` zeigt die Zeile als `active`; zweiter `POST` mit späterem `startDate` schließt die erste automatisch (per `GET` prüfen: erste Zeile hat jetzt `endDate` gesetzt, taucht nur noch in `history` auf).

---

## Phase 4 — Gewichtstrend-Berechnung + Route

**Neu:** `src/features/health/weight-trend.ts`

```ts
export type WeightTrendPoint = { date: string; rolling7d: number | null };

export type TrendSuggestion = {
  kind: "bump_calories" | "reduce_calories";
  reasonKey: string; // i18n-Key
  proposedWeeklyCalorieStep: number;
  proposedStartCalories: number;
};

export type WeightTrendResult = {
  points: WeightTrendPoint[];
  thisWeekAvg: number | null;
  lastWeekAvg: number | null;
  weeklyRateKg: number | null;
  weeklyRatePctBodyweight: number | null;
  trend: "rising" | "stable" | "falling" | null;
  suggestion: TrendSuggestion | null;
};

export function computeRollingAverage(
  entries: { date: Date; weightKg: number }[],
  windowDays: number
): WeightTrendPoint[]

export function classifyTrend(weeklyRatePctBodyweight: number | null): "rising" | "stable" | "falling" | null

export function buildSuggestion(
  phase: "CUT" | "REVERSE_DIET" | "MAINTENANCE" | "BULK",
  weeklyRatePctBodyweight: number | null,
  currentTarget: WeeklyTarget
): TrendSuggestion | null

export async function getWeightTrend(userId: string): Promise<WeightTrendResult>
```

**Ziel-Wochenrate pro Phase (Konstante im Modul, leicht später tunbar):**

```ts
const TARGET_RATE_PCT_PER_WEEK: Record<NutritionPhase, { min: number; max: number }> = {
  BULK:         { min: 0.15, max: 0.5 },
  REVERSE_DIET: { min: -0.15, max: 0.15 },
  MAINTENANCE:  { min: -0.15, max: 0.15 },
  CUT:          { min: -1.0, max: -0.3 },
};
```

- `weeklyRatePctBodyweight = (thisWeekAvg - lastWeekAvg) / lastWeekAvg * 100`.
- `trend`: `"rising"` wenn `weeklyRatePctBodyweight > 0.1`, `"falling"` wenn `< -0.1`, sonst `"stable"` (analog zu den festen Schwellenwerten in `recovery.ts`).
- `computeRollingAverage`: Fensterpunkt nur gesetzt, wenn **mindestens 4 von 7** Tagen im Fenster einen `BodyWeight`-Eintrag haben (sonst `null` für diesen Tag — kein interpoliertes Raten).
- `buildSuggestion` erfordert `thisWeekAvg` **und** `lastWeekAvg` beide `!= null` (sonst `null` zurückgeben — kein Vorschlag ohne ausreichend Datendichte, keine Falschmeldung).
- Logik pro Phase (alle vier abgedeckt, symmetrisch aus der Tabelle abgeleitet):
  - **BULK**, Rate `< min` → `bump_calories` (Step `+50`), `reasonKey: "health.nutrition.suggestion.bulkFlat"`.
  - **BULK**, Rate `> max` → `reduce_calories` (Step `-50`), `reasonKey: "health.nutrition.suggestion.bulkTooFast"`.
  - **REVERSE_DIET** / **MAINTENANCE**, Rate `> max` → `reduce_calories`, `reasonKey: "health.nutrition.suggestion.reverseGainingTooFast"`.
  - **REVERSE_DIET** / **MAINTENANCE**, Rate `< min` → kein Vorschlag (`null`) — Ziel dieser Phasen ist "nicht zu schnell steigen", ein zu langsamer/negativer Trend ist hier nicht korrekturbedürftig.
  - **CUT**, Rate `> max` (verliert zu langsam / hält / nimmt zu) → `reduce_calories`, `reasonKey: "health.nutrition.suggestion.cutTooSlow"`.
  - **CUT**, Rate `< min` (verliert zu schnell) → `bump_calories`, `reasonKey: "health.nutrition.suggestion.cutTooFast"`.
  - Sonst (innerhalb der Zielspanne) → `null`.
  - `proposedStartCalories = currentTarget.calories` (der Vorschlag startet bei dem, was diese Woche ohnehin gilt, nicht bei einem einmaligen Sprung), `proposedWeeklyCalorieStep = aktueller Step ± 50` je nach Richtung.

**Neu:** `src/app/api/nutrition-plan/weight-trend/route.ts`

- `GET`: ruft `getWeightTrend(userId)` auf, gibt `{ data: WeightTrendResult }` zurück. Rein lesend — diese Route schreibt nie etwas (das ist die strukturelle Garantie gegen stilles Automatisieren: "Annehmen" läuft ausschließlich über den bestehenden `POST /api/nutrition-plan` aus Phase 3, ausgelöst durch einen Button-Klick im Frontend).

**Verifikation Phase 4:** `npx tsc --noEmit` sauber. Mit mind. 14 Tagen `BodyWeight`-Testdaten (lokal per Prisma Studio oder `POST /api/body-weight` anlegen) prüfen: `GET .../weight-trend` liefert plausible `thisWeekAvg`/`lastWeekAvg` und bei absichtlich flachem Testdatensatz während einer `BULK`-Testphase eine `suggestion` mit `kind: "bump_calories"`.

---

## Phase 5 — UI: Plan-Editor in Settings

**Neu:** `src/app/(app)/settings/nutrition-plan/page.tsx` — dünner Wrapper nach Muster `settings/cardio/page.tsx`:

```tsx
"use client";
import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { NutritionPlanSection } from "@/features/settings/components/nutrition-plan-section";

export default function NutritionPlanSettingsPage() {
  return <RequireAuth><BackButton /><NutritionPlanSection /></RequireAuth>;
}
```

**Neu:** `src/features/settings/components/nutrition-plan-section.tsx`

- Formular: Phase-Auswahl (4 Optionen), Startdatum, Startkalorien, wöchentlicher Schritt, Protein g/kg, Fett g/kg, optional ein- und ausklappbarer "Erweitert"-Bereich für Min/Max-Kalorien-Guardrails (siehe Produktentscheidung: optional).
- Bei Submit: `POST /api/nutrition-plan`.
- Darunter: Zusammenfassung des aktiven Plans (Phase, seit wann, aktuelle Woche, berechnetes Kalorienziel) + eingeklappte History-Liste (read-only, jede Zeile Phase + Datumsspanne + Startkalorien).
- Einstiegspunkt in `src/app/(app)/settings/page.tsx` ergänzen: neue `<SettingsRow href="/settings/nutrition-plan" icon={Target} label={t("settings.menuNutritionPlan")} />` in der bestehenden `<div className="ios-group">`-Liste (Icon aus `lucide-react`, z.B. `Target` oder `TrendingUp` — freie Wahl, konsistent mit vorhandenen Icons).

**Verifikation Phase 5:** `npm run dev`, `/settings` öffnen → neuer Eintrag sichtbar → `/settings/nutrition-plan` öffnen, Plan anlegen, Erfolg sichtbar (Zusammenfassung aktualisiert sich), zweiten Plan mit späterem Startdatum anlegen → History zeigt beide Zeilen korrekt.

---

## Phase 6 — UI: Trend-Karte + Einbindung in bestehende Nutrition-Komponenten

**Neu:** `src/features/health/components/weight-trend-card.tsx`

- Client-Fetch `GET /api/nutrition-plan/weight-trend`, cache-first über `loadHealthCache`/`saveHealthCache` (neuer Cache-Key `"weight-trend"`), gleiches Muster wie `nutrition-detail.tsx:25-59`.
- Rendert: Recharts-`LineChart` von `points[].rolling7d` (Stil von `src/features/tracking/components/body-weight-chart.tsx` übernehmen), `thisWeekAvg` vs. `lastWeekAvg`, `weeklyRatePctBodyweight`, `trend`-Badge.
- Wenn `suggestion !== null`: Karte mit i18n-Text aus `reasonKey`, zwei Buttons **Übernehmen** und **Nicht jetzt**.
  - **Übernehmen**: ruft `POST /api/nutrition-plan` mit `startDate = heute`, `phase`/`proteinPerKg`/`fatPerKg`/Guardrails vom aktiven Plan übernommen, `startCalories = suggestion.proposedStartCalories`, `weeklyCalorieStep = suggestion.proposedWeeklyCalorieStep`. Danach `weight-trend` und aktiven Plan neu laden (Vorschlag verschwindet, da neue Zeile aktiv ist).
  - **Nicht jetzt**: blendet die Karte nur für diese Ansicht aus (kein Persistieren, siehe Produktentscheidung 4) — lokaler `useState`, kein API-Call.
- Platzierung: ausschließlich in `src/features/health/components/nutrition-detail.tsx`, als neue Sektion unterhalb von `<CalorieBalance />` (siehe Produktentscheidung 3).

**Ändern:** `src/features/health/hooks/use-weekly-nutrition-target.ts` (neu)

- Holt parallel `GET /api/nutrition-plan` (aktiver Plan) und den letzten `BodyWeight`-Eintrag.
- Kein aktiver Plan → `{ calories: CALORIE_TARGET_DEFAULT, protein: MACRO_TARGETS[protein].target, carbs: MACRO_TARGETS[carbs].target, fat: MACRO_TARGETS[fat].target, isPersonalized: false }`.
- Aktiver Plan vorhanden → `computeWeeklyTarget()` clientseitig aufrufen (reine Funktion, sicher im Browser), `isPersonalized: true`.
- Cache über `loadHealthCache`/`saveHealthCache`, Key `"weekly-nutrition-target"`.

**Ändern:** `src/features/health/components/nutrition-card.tsx` und `nutrition-detail.tsx`

- Beide nutzen `useWeeklyNutritionTarget()` statt direktem `CALORIE_TARGET_DEFAULT`/`MACRO_TARGETS[].target`-Import für die **Zielwerte**. Label/Unit/Color/Description aus `MACRO_TARGETS` bleiben unverändert bestehen.
- `nutrition-detail.tsx`: `CalorieBalance`s `target = CALORIE_TARGET_DEFAULT` (Zeile 107) → `target = weeklyTarget.calories ?? CALORIE_TARGET_DEFAULT`. `dynamicCarbTarget()` (Zeile 315-320) wird entfernt; `MacroSection` (Zeile 181-193) baut `.target` für `protein`/`carbs`/`fat` aus `weeklyTarget` wenn `isPersonalized`, sonst aus dem bisherigen statischen Wert.
- Kleiner Indikator ("Personalisiert nach deinem Plan" vs. Standardwert), sichtbar über `isPersonalized`.

**i18n:** neue Keys unter `health` in `en.json`/`de.json`:
`health.nutritionPlan.{title,phase.cut,phase.reverseDiet,phase.maintenance,phase.bulk,startCalories,weeklyStep,proteinPerKg,fatPerKg,minCalories,maxCalories,personalized,defaultTarget}`,
`health.weightTrend.{title,thisWeek,lastWeek,rising,stable,falling,accept,dismiss,accepted}`,
`health.nutrition.suggestion.{bulkFlat,bulkTooFast,reverseGainingTooFast,cutTooSlow,cutTooFast}`,
`settings.menuNutritionPlan`.

**Verifikation Phase 6:** `npm run dev`, `/health/nutrition` ohne aktiven Plan öffnen → Standardwerte wie bisher (keine Regression für Tag-1-Zustand). Plan anlegen (Phase 5) → Seite neu laden → Zielwerte ändern sich sichtbar, "Personalisiert"-Indikator erscheint. Mit präparierten Testdaten (Phase 4) eine `suggestion` erzeugen → Karte erscheint, **Übernehmen** klicken → neuer Plan aktiv, Karte verschwindet; **Nicht jetzt** klicken → Karte verschwindet ohne Server-Call (Network-Tab prüfen).

---

## Phase 7 — Doku aktualisieren

- **`project-docs/database-schema.md`**: neuer Abschnitt `### NutritionPlan` (gleiche `Column | Type | Notes`-Tabelle wie bei `### BodyWeight`), ASCII-Baum oben um `├──* NutritionPlan` ergänzen, kurzer "Design Notes"-Absatz zur `endDate`-Konvention und zum "Annehmen = neue Zeile"-Mechanismus.
- **`project-docs/api-routes.md`**: neuer Abschnitt `## Nutrition Plan` mit allen vier Routen (`GET`/`POST /api/nutrition-plan`, `PATCH /api/nutrition-plan/:id`, `GET /api/nutrition-plan/weight-trend`), inkl. Hinweis, dass die Trend-Route nie mutiert.
- **Neu:** `project-docs/nutrition-planning.md` — Kurzdoku der Kalorien-/Makro-Formel, der Ziel-Wochenraten-Tabelle und des "Vorschläge ändern nichts ohne Bestätigung"-Prinzips mit Verweis auf `erstelle-absoluten-masterplan-der-nifty-reef.md`.

**Verifikation Phase 7:** Docs lesbar, keine toten Links, Tabellen rendern korrekt in Markdown-Preview.

---

## Gesamt-Verifikation

1. `npx tsc --noEmit` — sauber über den gesamten Diff.
2. `npm run build` — erfolgreich.
3. Manuelle Checkliste (User, siehe unten) durchgehen.
4. `git log` prüfen: sieben Commits (einer pro Phase), jeder mit conventional prefix + `Co-Authored-By`.

## Codex vs. User — expliziter Split

**Codex macht:**
- Alle Code-/Schema-/Doku-Änderungen in Phasen 1–7.
- `npx prisma generate`, `npx tsc --noEmit`, `npm run build` lokal ausführen und Fehler beheben.
- Commits pro Phase, kein Push.

**User macht (nicht von Codex ausführbar):**
- `npx prisma migrate dev --name add_nutrition_plan` lokal freigeben/ausführen (DB-Schemaänderung an der echten Neon-DB — Codex führt Migrationen nicht selbstständig gegen die produktive Datenbank aus).
- Manuellen Klicktest laut Checkliste unten durchführen.
- Branch reviewen und selbst nach `main` mergen/pushen, wenn zufrieden.

### Manuelle Test-Checkliste (User)

1. `/settings` → neuer Menüpunkt "Ernährungsplan" sichtbar und klickbar.
2. Ersten Plan anlegen (z.B. Reverse Diet, Startkalorien = aktueller Wert, Step +50/Woche) → Zusammenfassung zeigt korrekte Werte.
3. `/health/nutrition` öffnen → Kalorien-/Makro-Ziele haben sich geändert, "Personalisiert"-Hinweis sichtbar.
4. Zweiten Plan (Bulk) mit späterem Startdatum anlegen → alter Plan taucht in History auf, neuer ist aktiv.
5. Mindestens 14 Tage Körpergewicht eintragen (oder vorhandene Altdaten nutzen) → Trend-Karte auf `/health/nutrition` zeigt 7-Tage-Verlauf.
6. Falls ein Vorschlag erscheint: **Nicht jetzt** klicken → verschwindet, kein Server-Call. Seite neu laden → Vorschlag erscheint wieder (erwartetes Verhalten, flüchtig).
7. Vorschlag **Übernehmen** → neuer Plan sichtbar in History, Ziel-Kalorien ändern sich entsprechend.
8. Ohne jeden Plan (frischer Test-User oder Plan-History leer) → `/health/nutrition` zeigt weiterhin die alten Standardwerte, keine Fehler, keine leere Seite.

## Explizite Non-Goals

- Keine Push-Benachrichtigung "Zeit, den Trend zu prüfen" — außerhalb des Scopes.
- Kein automatisches Anwenden eines Vorschlags ohne Klick — bewusst ausgeschlossen (Prinzip aus Nifty-Reef-Masterplan).
- Kein LLM/KI-Anteil — die Vorschlagslogik ist vollständig deterministisch (passt zur bestehenden Architekturleitplanke "Regeln vor LLM").
- Kein MCP-Tool-Update für den neuen Plan/Trend (z.B. `fittrack_recommendations`) — kann später separat ergänzt werden, hier nicht enthalten.
- Keine Änderung an `HealthSnapshot`/Apple-Health-Import — dieses Feature liest nur `BodyWeight`, nicht die Ernährungswerte aus dem Health-Sync.
- Keine iOS/Watch-Anbindung (keine nativen Dateien betroffen).
- Keine vollständige Nachdokumentation der bereits vorhandenen Lücken in `database-schema.md`/`api-routes.md` — nur der neue Teil wird ergänzt.

## Betroffene Dateien

**Neu:**
- `src/lib/trend-math.ts`
- `src/lib/units.ts`
- `src/features/health/nutrition-plan.ts`
- `src/features/health/nutrition-plan-schemas.ts`
- `src/features/health/weight-trend.ts`
- `src/features/health/hooks/use-weekly-nutrition-target.ts`
- `src/features/health/components/weight-trend-card.tsx`
- `src/features/settings/components/nutrition-plan-section.tsx`
- `src/app/api/nutrition-plan/route.ts`
- `src/app/api/nutrition-plan/[id]/route.ts`
- `src/app/api/nutrition-plan/weight-trend/route.ts`
- `src/app/(app)/settings/nutrition-plan/page.tsx`
- `project-docs/nutrition-planning.md`

**Geändert:**
- `prisma/schema.prisma`
- `src/features/health/recovery.ts`
- `src/features/health/components/nutrition-card.tsx`
- `src/features/health/components/nutrition-detail.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/messages/en.json`, `src/messages/de.json`
- `project-docs/database-schema.md`, `project-docs/api-routes.md`

# Reverse Diet / Bulk Nutrition Planning

Replaces the static `CALORIE_TARGET_DEFAULT`/`MACRO_TARGETS` in `src/features/health/nutrition-config.ts` with a weekly-scaling plan when the user has one active, falling back to those static defaults otherwise (see `useWeeklyNutritionTarget()` in `src/features/health/hooks/use-weekly-nutrition-target.ts`).

## Calorie formula

```
weeksElapsed = floor((today - plan.startDate) / 7 days), minimum 0
rawCalories  = plan.startCalories + weeksElapsed * plan.weeklyCalorieStep
calories     = clamp(rawCalories, plan.minCalories ?? -∞, plan.maxCalories ?? +∞)
```

## Macro formula

Protein and fat scale from the latest logged `BodyWeight` (converted to kg via `UserSettings.weightUnit`); carbs are the remainder:

```
protein_g   = plan.proteinPerKg * bodyWeightKg
fat_g       = plan.fatPerKg * bodyWeightKg
proteinKcal = protein_g * 4
fatKcal     = fat_g * 9
carbs_g     = max(0, calories - proteinKcal - fatKcal) / 4
```

Implemented in `computeWeeklyTarget()`, `src/features/health/nutrition-plan.ts`.

## Weight-trend target rates

`src/features/health/weight-trend.ts` computes a density-gated 7-day rolling average of body weight (requires ≥4 of the trailing 7 days logged), compares this week's average to last week's as %bodyweight/week, and checks it against a per-phase target range:

| Phase | Target rate (%bodyweight/week) |
|-------|-------------------------------|
| BULK | +0.15 to +0.5 |
| REVERSE_DIET | −0.15 to +0.15 |
| MAINTENANCE | −0.15 to +0.15 |
| CUT | −1.0 to −0.3 |

Outside the range, a suggestion (`bump_calories` or `reduce_calories`, ±50 kcal/week) is surfaced. This is a single constant table (`TARGET_RATE_PCT_PER_WEEK`) — tune it in place, no schema change needed.

## Suggestions never auto-apply

A weight-trend suggestion is only ever a proposal shown in `WeightTrendCard` (`src/features/health/components/weight-trend-card.tsx`) with explicit **Übernehmen**/**Nicht jetzt** buttons. `GET /api/nutrition-plan/weight-trend` is read-only; accepting a suggestion goes through the same `POST /api/nutrition-plan` used to start any new phase, triggered only by the user's click. This mirrors this codebase's existing principle (see `erstelle-absoluten-masterplan-der-nifty-reef.md`, architecture leitplanke #3): recommendations are visible, reasoned, and never change values without an explicit "Übernehmen".

Dismissing a suggestion ("Nicht jetzt") is ephemeral — it hides the card for that render only, with no persisted dismiss-state; it reappears next visit if the underlying condition still holds.

## Plan history

`NutritionPlan` rows form a history, not a single mutable record — see `database-schema.md`'s Design Notes for the `endDate` convention and why accepting a suggestion creates a new row instead of patching the current one.

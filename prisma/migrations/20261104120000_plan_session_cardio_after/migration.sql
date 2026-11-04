-- Offer a cardio session after this workout day (phone summary + Watch). Additive with a default: safe on a live database.
ALTER TABLE "plan_sessions"
  ADD COLUMN IF NOT EXISTS "cardioAfter" BOOLEAN NOT NULL DEFAULT false;

-- The calves + forearms day is where cardio follows; switch it on once (the toggle in the plan editor changes it later).
UPDATE "plan_sessions" SET "cardioAfter" = true WHERE "name" ILIKE '%calves%' AND "cardioAfter" = false;

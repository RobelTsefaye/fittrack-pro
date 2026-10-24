-- Additive, nullable columns only: safe to apply on a live database.
ALTER TABLE "plan_session_exercises"
  ADD COLUMN IF NOT EXISTS "repMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "repMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "restSeconds" INTEGER;

ALTER TABLE "workout_exercises"
  ADD COLUMN IF NOT EXISTS "repMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "repMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "restSeconds" INTEGER;

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "goalWeight" DOUBLE PRECISION;

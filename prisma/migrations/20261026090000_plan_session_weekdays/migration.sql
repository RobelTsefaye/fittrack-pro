-- Fixed weekdays per workout day (0 = Monday … 6 = Sunday). Additive with a default: safe on a live database.
ALTER TABLE "plan_sessions"
  ADD COLUMN IF NOT EXISTS "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

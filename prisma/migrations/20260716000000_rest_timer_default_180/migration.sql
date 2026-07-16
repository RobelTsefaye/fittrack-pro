ALTER TABLE "user_settings"
ALTER COLUMN "restTimerDefault"
SET DEFAULT 180;

UPDATE "user_settings"
SET "restTimerDefault" = 180
WHERE "restTimerDefault" = 90;

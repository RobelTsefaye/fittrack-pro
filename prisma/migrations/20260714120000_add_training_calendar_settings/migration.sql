-- AlterTable
ALTER TABLE "user_settings"
ADD COLUMN "calendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "trainingWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "trainingTimeMinutes" INTEGER NOT NULL DEFAULT 1080;

CREATE TYPE "CalendarKind" AS ENUM ('TRAINING', 'CARDIO');

ALTER TABLE "user_settings"
ADD COLUMN "trainingDurationMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "cardioSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cardioWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "cardioTimeMinutes" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN "cardioDurationMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN "cardioLabel" TEXT NOT NULL DEFAULT '';

CREATE TABLE "calendar_overrides" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "CalendarKind" NOT NULL,
  "date" DATE NOT NULL,
  "skip" BOOLEAN NOT NULL DEFAULT false,
  "movedToDate" DATE,
  "timeMinutes" INTEGER,
  "durationMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "calendar_overrides_userId_kind_date_key" ON "calendar_overrides"("userId", "kind", "date");
CREATE INDEX "calendar_overrides_userId_kind_idx" ON "calendar_overrides"("userId", "kind");

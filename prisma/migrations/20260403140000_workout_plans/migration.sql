-- CreateTable
CREATE TABLE "workout_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_sessions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_session_exercises" (
    "id" TEXT NOT NULL,
    "planSessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "targetSets" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "plan_session_exercises_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "workouts" ADD COLUMN "planSessionId" TEXT;

-- CreateIndex
CREATE INDEX "workout_plans_userId_idx" ON "workout_plans"("userId");

-- CreateIndex
CREATE INDEX "plan_sessions_planId_idx" ON "plan_sessions"("planId");

-- CreateIndex
CREATE INDEX "plan_session_exercises_planSessionId_idx" ON "plan_session_exercises"("planSessionId");

-- CreateIndex
CREATE INDEX "workouts_planSessionId_idx" ON "workouts"("planSessionId");

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_session_exercises" ADD CONSTRAINT "plan_session_exercises_planSessionId_fkey" FOREIGN KEY ("planSessionId") REFERENCES "plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_session_exercises" ADD CONSTRAINT "plan_session_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workouts" ADD CONSTRAINT "workouts_planSessionId_fkey" FOREIGN KEY ("planSessionId") REFERENCES "plan_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'LEGS', 'GLUTES', 'CORE', 'FOREARMS', 'CALVES', 'FULL_BODY', 'CARDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "Equipment" AS ENUM ('BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'KETTLEBELL', 'BAND', 'OTHER');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppLocale" AS ENUM ('EN', 'DE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "restTimerDefault" INTEGER NOT NULL DEFAULT 90,
    "locale" "AppLocale" NOT NULL DEFAULT 'EN',

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "muscleGroup" "MuscleGroup" NOT NULL,
    "equipment" "Equipment" NOT NULL DEFAULT 'BODYWEIGHT',
    "notes" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "durationSeconds" INTEGER,
    "planSessionId" TEXT,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "notes" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sets" (
    "id" TEXT NOT NULL,
    "workoutExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "reps" INTEGER,
    "weight" DOUBLE PRECISION,
    "durationSeconds" INTEGER,
    "rpe" DOUBLE PRECISION,
    "isWarmup" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_weights" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "estimated1RM" DOUBLE PRECISION,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setId" TEXT NOT NULL,

    CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_tokenHash_key" ON "api_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "api_tokens_userId_idx" ON "api_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE INDEX "exercises_userId_idx" ON "exercises"("userId");

-- CreateIndex
CREATE INDEX "exercises_muscleGroup_idx" ON "exercises"("muscleGroup");

-- CreateIndex
CREATE INDEX "workout_plans_userId_idx" ON "workout_plans"("userId");

-- CreateIndex
CREATE INDEX "plan_sessions_planId_idx" ON "plan_sessions"("planId");

-- CreateIndex
CREATE INDEX "plan_session_exercises_planSessionId_idx" ON "plan_session_exercises"("planSessionId");

-- CreateIndex
CREATE INDEX "workouts_userId_startedAt_idx" ON "workouts"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "workouts_planSessionId_idx" ON "workouts"("planSessionId");

-- CreateIndex
CREATE INDEX "workout_exercises_workoutId_idx" ON "workout_exercises"("workoutId");

-- CreateIndex
CREATE INDEX "sets_workoutExerciseId_idx" ON "sets"("workoutExerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "body_weights_userId_date_key" ON "body_weights"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "personal_records_setId_key" ON "personal_records"("setId");

-- CreateIndex
CREATE INDEX "personal_records_userId_exerciseId_idx" ON "personal_records"("userId", "exerciseId");

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_session_exercises" ADD CONSTRAINT "plan_session_exercises_planSessionId_fkey" FOREIGN KEY ("planSessionId") REFERENCES "plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_session_exercises" ADD CONSTRAINT "plan_session_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_planSessionId_fkey" FOREIGN KEY ("planSessionId") REFERENCES "plan_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "workout_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_weights" ADD CONSTRAINT "body_weights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

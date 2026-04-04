-- CreateIndex
CREATE INDEX "workouts_userId_completedAt_idx" ON "workouts"("userId", "completedAt");

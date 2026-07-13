import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import type { PreviousLogEntry } from "@/features/workouts/previous-logs-types";

/** Returns the latest qualifying completed-session working sets for every
 * exercise the user has logged. This is used to warm the offline "last time"
 * cache before a workout is opened. */
export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latestWes = await prisma.$queryRaw<Array<{ id: string; exerciseId: string }>>`
    SELECT DISTINCT ON (we."exerciseId") we.id, we."exerciseId"
    FROM "workout_exercises" we
    JOIN "workouts" w ON w.id = we."workoutId"
    WHERE w."userId" = ${userId}
      AND w."completedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "sets" s
        WHERE s."workoutExerciseId" = we.id
          AND s."isWarmup" = false
          AND s.reps > 0
          AND s.weight IS NOT NULL
      )
    ORDER BY we."exerciseId", w."startedAt" DESC
  `;

  if (latestWes.length === 0) {
    return NextResponse.json({ data: {} as Record<string, PreviousLogEntry> });
  }

  const exerciseByWeId = new Map(latestWes.map((we) => [we.id, we.exerciseId]));
  const sets = await prisma.set.findMany({
    where: {
      workoutExerciseId: { in: latestWes.map((we) => we.id) },
      isWarmup: false,
      reps: { gt: 0 },
      weight: { not: null },
    },
    orderBy: { setNumber: "asc" },
    select: { workoutExerciseId: true, setNumber: true, weight: true, reps: true, rpe: true },
  });

  const data: Record<string, PreviousLogEntry> = {};
  for (const set of sets) {
    const exerciseId = exerciseByWeId.get(set.workoutExerciseId);
    if (!exerciseId) continue;
    const entry = { setNumber: set.setNumber, weight: set.weight, reps: set.reps, rpe: set.rpe };
    const existing = data[exerciseId];
    if (existing) existing.push(entry);
    else data[exerciseId] = [entry];
  }

  return NextResponse.json({ data });
}

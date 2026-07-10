import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RawRow = {
  exerciseId: string;
  setCount: number;
  workoutCount: number;
  lastUsed: Date;
};

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      we."exerciseId" AS "exerciseId",
      COUNT(s.id)::int AS "setCount",
      COUNT(DISTINCT we."workoutId")::int AS "workoutCount",
      MAX(COALESCE(s."completedAt", w."completedAt", w."startedAt")) AS "lastUsed"
    FROM sets s
    INNER JOIN workout_exercises we ON we.id = s."workoutExerciseId"
    INNER JOIN workouts w ON w.id = we."workoutId"
    INNER JOIN exercises e ON e.id = we."exerciseId"
    WHERE w."userId" = ${userId}
      AND w."completedAt" IS NOT NULL
      AND s."isWarmup" = false
      AND s.reps > 0
      AND (e."userId" IS NULL OR e."userId" = ${userId})
    GROUP BY we."exerciseId"
    ORDER BY COUNT(s.id) DESC
    LIMIT 40
  `;

  if (rows.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const ids = rows.map((r) => r.exerciseId);
  const exercises = await prisma.exercise.findMany({
    where: {
      id: { in: ids },
      OR: [{ userId: null }, { userId }],
    },
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      equipment: true,
    },
  });

  const byId = new Map(exercises.map((e) => [e.id, e]));

  const data = rows
    .map((r) => {
      const ex = byId.get(r.exerciseId);
      if (!ex) return null;
      return {
        exercise: ex,
        setCount: r.setCount,
        workoutCount: r.workoutCount,
        lastUsed: r.lastUsed.toISOString(),
      };
    })
    .filter(Boolean);

  return NextResponse.json({ data });
}

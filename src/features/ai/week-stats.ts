import {
  eachWeekOfInterval,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { prisma } from "@/lib/prisma";

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Working sets (non-warmup, weight×reps) per Mon-start week, aligned with dashboard volume weeks. */
export async function getWorkingSetsCountWeekly(userId: string, weekCount: number) {
  const now = new Date();
  const intervalStart = startOfWeek(subWeeks(now, weekCount - 1), { weekStartsOn: 1 });
  const weekStarts = eachWeekOfInterval(
    { start: intervalStart, end: now },
    { weekStartsOn: 1 }
  );

  const sets = await prisma.set.findMany({
    where: {
      isWarmup: false,
      reps: { gt: 0 },
      weight: { gt: 0 },
      workoutExercise: {
        workout: {
          userId,
          completedAt: { not: null, gte: intervalStart },
        },
      },
    },
    select: {
      workoutExercise: {
        select: {
          workout: { select: { completedAt: true } },
        },
      },
    },
  });

  const map = new Map<string, number>();
  for (const ws of weekStarts) {
    map.set(utcDayKey(startOfWeek(ws, { weekStartsOn: 1 })), 0);
  }

  for (const s of sets) {
    const c = s.workoutExercise.workout.completedAt!;
    const k = utcDayKey(startOfWeek(c, { weekStartsOn: 1 }));
    map.set(k, (map.get(k) ?? 0) + 1);
  }

  return weekStarts.map((ws) => {
    const k = utcDayKey(startOfWeek(ws, { weekStartsOn: 1 }));
    return { key: k, workingSets: map.get(k) ?? 0 };
  });
}

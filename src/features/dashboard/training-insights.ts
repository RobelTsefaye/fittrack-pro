import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { exercisePath } from "@/lib/constants";
import { epley1RM } from "@/lib/strength";

/** Local copy to avoid importing `queries.ts` (would circularly import this module). */
async function topExerciseIdsByVolume(userId: string, days: number, take: number) {
  const since = subDays(new Date(), days);
  const sets = await prisma.set.findMany({
    where: {
      isWarmup: false,
      reps: { gt: 0 },
      weight: { gt: 0 },
      workoutExercise: {
        workout: {
          userId,
          completedAt: { not: null, gte: since },
        },
      },
    },
    select: {
      reps: true,
      weight: true,
      workoutExercise: {
        select: {
          exerciseId: true,
          exercise: { select: { name: true } },
        },
      },
    },
  });

  const byExercise = new Map<string, { name: string; volume: number }>();
  for (const s of sets) {
    const id = s.workoutExercise.exerciseId;
    const name = s.workoutExercise.exercise.name;
    const add = (s.reps ?? 0) * (s.weight ?? 0);
    const cur = byExercise.get(id);
    if (cur) cur.volume += add;
    else byExercise.set(id, { name, volume: add });
  }

  return [...byExercise.entries()]
    .map(([exerciseId, v]) => ({ exerciseId, name: v.name, volume: v.volume }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, take);
}

const WINDOW_DAYS = 56;
const HALF_DAYS = 28;
/** Session must appear in both halves to count; strength flat within this ratio → plateau. */
const PLATEAU_RATIO = 1.015;

export type PlateauFinding = {
  exerciseId: string;
  exerciseName: string;
  bestFirstHalf: number;
  bestSecondHalf: number;
};

export type DeloadFinding =
  | { reason: "high_frequency"; workoutsLast21Days: number }
  | { reason: "grind_no_pr"; workoutsLast28Days: number };

export async function analyzePlateaus(userId: string): Promise<PlateauFinding[]> {
  const windowStart = subDays(new Date(), WINDOW_DAYS);
  const mid = subDays(new Date(), HALF_DAYS);

  const top = await topExerciseIdsByVolume(userId, WINDOW_DAYS, 5);
  if (top.length === 0) return [];

  const exerciseIds = top.map((t) => t.exerciseId);
  const sets = await prisma.set.findMany({
    where: {
      isWarmup: false,
      reps: { gt: 0 },
      weight: { gt: 0 },
      workoutExercise: {
        exerciseId: { in: exerciseIds },
        workout: {
          userId,
          completedAt: { not: null, gte: windowStart },
        },
      },
    },
    select: {
      weight: true,
      reps: true,
      workoutExercise: {
        select: {
          exerciseId: true,
          exercise: { select: { name: true } },
          workout: { select: { id: true, completedAt: true } },
        },
      },
    },
  });

  type SessionAgg = { bestE1: number; at: Date };
  const byExercise = new Map<string, { name: string; byWorkout: Map<string, SessionAgg> }>();

  for (const s of sets) {
    const exId = s.workoutExercise.exerciseId;
    const name = s.workoutExercise.exercise.name;
    const w = s.workoutExercise.workout;
    const completed = w.completedAt!;
    const e1 = epley1RM(s.weight!, s.reps!);
    if (e1 <= 0) continue;

    let block = byExercise.get(exId);
    if (!block) {
      block = { name, byWorkout: new Map() };
      byExercise.set(exId, block);
    }
    const prev = block.byWorkout.get(w.id);
    if (!prev || e1 > prev.bestE1) {
      block.byWorkout.set(w.id, { bestE1: e1, at: completed });
    }
  }

  const out: PlateauFinding[] = [];

  for (const [exerciseId, { name, byWorkout }] of byExercise) {
    const sessions = [...byWorkout.values()];
    const first = sessions.filter((x) => x.at >= windowStart && x.at < mid);
    const second = sessions.filter((x) => x.at >= mid);
    if (first.length < 2 || second.length < 2) continue;

    const bestFirst = Math.max(...first.map((x) => x.bestE1));
    const bestSecond = Math.max(...second.map((x) => x.bestE1));
    if (bestFirst <= 0) continue;
    if (bestSecond <= bestFirst * PLATEAU_RATIO) {
      out.push({
        exerciseId,
        exerciseName: name,
        bestFirstHalf: Math.round(bestFirst * 10) / 10,
        bestSecondHalf: Math.round(bestSecond * 10) / 10,
      });
    }
  }

  return out.sort((a, b) => b.bestFirstHalf - a.bestFirstHalf).slice(0, 2);
}

export async function analyzeDeloadSignals(userId: string): Promise<DeloadFinding[]> {
  const now = new Date();
  const d21 = subDays(now, 21);
  const d28 = subDays(now, 28);
  const d5 = subDays(now, 5);

  const [workouts21, workouts28, prs21, lastDone] = await Promise.all([
    prisma.workout.count({
      where: { userId, completedAt: { not: null, gte: d21 } },
    }),
    prisma.workout.count({
      where: { userId, completedAt: { not: null, gte: d28 } },
    }),
    prisma.personalRecord.count({
      where: { userId, achievedAt: { gte: d21 } },
    }),
    prisma.workout.findFirst({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);

  const stillActive =
    lastDone?.completedAt != null && lastDone.completedAt >= d5;

  const out: DeloadFinding[] = [];
  if (workouts21 >= 10) {
    out.push({ reason: "high_frequency", workoutsLast21Days: workouts21 });
  } else if (workouts28 >= 8 && prs21 === 0 && stillActive) {
    out.push({ reason: "grind_no_pr", workoutsLast28Days: workouts28 });
  }
  return out;
}

export type DashboardInsightItem = {
  id: string;
  severity: "attention" | "suggest" | "info";
  messageKey: string;
  params?: Record<string, string | number>;
  href?: string;
};

export async function getDashboardInsightItems(userId: string): Promise<DashboardInsightItem[]> {
  const [plateaus, deloads, completedTotal] = await Promise.all([
    analyzePlateaus(userId),
    analyzeDeloadSignals(userId),
    prisma.workout.count({ where: { userId, completedAt: { not: null } } }),
  ]);

  const items: DashboardInsightItem[] = [];

  for (const d of deloads) {
    if (d.reason === "high_frequency") {
      items.push({
        id: "deload-freq",
        severity: "attention",
        messageKey: "dashboard.insightDeloadFrequency",
        params: { count: d.workoutsLast21Days },
      });
    } else {
      items.push({
        id: "deload-grind",
        severity: "suggest",
        messageKey: "dashboard.insightDeloadStall",
        params: { count: d.workoutsLast28Days },
      });
    }
  }

  for (const p of plateaus) {
    items.push({
      id: `plateau-${p.exerciseId}`,
      severity: "suggest",
      messageKey: "dashboard.insightPlateauExercise",
      params: {
        name: p.exerciseName,
        first: p.bestFirstHalf,
        second: p.bestSecondHalf,
      },
      href: exercisePath(p.exerciseId),
    });
  }

  if (items.length === 0 && completedTotal >= 5) {
    items.push({
      id: "all-clear",
      severity: "info",
      messageKey: "dashboard.insightsAllGood",
    });
  } else if (items.length === 0) {
    items.push({
      id: "keep-logging",
      severity: "info",
      messageKey: "dashboard.insightsKeepLogging",
    });
  }

  return items.slice(0, 4);
}

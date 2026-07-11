import { unstable_cache } from "next/cache";
import {
  addDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { dashboardCacheTag } from "@/lib/constants";
import {
  getDashboardInsightItems,
  type DashboardInsightItem,
} from "@/features/dashboard/training-insights";

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeWorkoutStreak(completedAts: Date[]): number {
  const days = new Set(completedAts.map((d) => utcDayKey(d)));
  if (days.size === 0) return 0;
  const sortedDesc = [...days].sort((a, b) => b.localeCompare(a));
  const lastKey = sortedDesc[0]!;
  let streak = 0;
  const cursor = new Date(`${lastKey}T12:00:00.000Z`);
  while (days.has(utcDayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function getDashboardSummary(userId: string) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  /** Cap streak query — full history can be huge; streak beyond ~5y is negligible */
  const streakSince = subDays(now, 5 * 365);

  const [completedAll, weekCount, monthCount, prCount, completedWorkouts] =
    await Promise.all([
      prisma.workout.count({
        where: { userId, completedAt: { not: null } },
      }),
      prisma.workout.count({
        where: {
          userId,
          completedAt: { not: null, gte: weekStart },
        },
      }),
      prisma.workout.count({
        where: {
          userId,
          completedAt: { not: null, gte: monthStart },
        },
      }),
      prisma.personalRecord.count({ where: { userId } }),
      prisma.workout.findMany({
        where: {
          userId,
          completedAt: { not: null, gte: streakSince },
        },
        select: { completedAt: true },
      }),
    ]);

  const streak = computeWorkoutStreak(
    completedWorkouts.map((w) => w.completedAt!).filter(Boolean)
  );

  return {
    totalWorkouts: completedAll,
    completedThisWeek: weekCount,
    completedThisMonth: monthCount,
    personalRecordsCount: prCount,
    workoutStreakDays: streak,
  };
}

export async function getRecentPersonalRecords(userId: string, take = 6) {
  return prisma.personalRecord.findMany({
    where: { userId },
    orderBy: { achievedAt: "desc" },
    take,
    include: {
      exercise: { select: { id: true, name: true } },
    },
  });
}

/**
 * Volume per completed workout since `since`, aggregated in SQL — transfers
 * one row per workout instead of one row per set.
 */
async function getWorkoutVolumesSince(
  userId: string,
  since: Date
): Promise<Array<{ completedAt: Date; volume: number }>> {
  return prisma.$queryRaw<Array<{ completedAt: Date; volume: number }>>`
    SELECT w."completedAt", SUM(s.reps * s.weight)::float AS volume
    FROM "sets" s
    JOIN "workout_exercises" we ON we.id = s."workoutExerciseId"
    JOIN "workouts" w ON w.id = we."workoutId"
    WHERE w."userId" = ${userId}
      AND w."completedAt" IS NOT NULL
      AND w."completedAt" >= ${since}
      AND s."isWarmup" = false
      AND s.reps > 0
      AND s.weight > 0
    GROUP BY w.id
  `;
}

export async function getVolumeBucketsWeekly(userId: string, weekCount = 10) {
  const now = new Date();
  const intervalStart = startOfWeek(subWeeks(now, weekCount - 1), { weekStartsOn: 1 });
  const weekStarts = eachWeekOfInterval(
    { start: intervalStart, end: now },
    { weekStartsOn: 1 }
  );

  const workoutVolumes = await getWorkoutVolumesSince(userId, intervalStart);

  const volByWeekStart = new Map<string, number>();
  for (const ws of weekStarts) {
    volByWeekStart.set(utcDayKey(startOfWeek(ws, { weekStartsOn: 1 })), 0);
  }

  for (const w of workoutVolumes) {
    const wk = startOfWeek(w.completedAt, { weekStartsOn: 1 });
    const key = utcDayKey(wk);
    volByWeekStart.set(key, (volByWeekStart.get(key) ?? 0) + w.volume);
  }

  return weekStarts.map((ws) => {
    const k = utcDayKey(startOfWeek(ws, { weekStartsOn: 1 }));
    return {
      key: k,
      label: k.slice(5),
      volume: volByWeekStart.get(k) ?? 0,
    };
  });
}

export async function getVolumeBucketsMonthly(userId: string, monthCount = 6) {
  const now = new Date();
  const intervalStart = startOfMonth(subMonths(now, monthCount - 1));
  const months = eachMonthOfInterval({ start: intervalStart, end: now });

  const workoutVolumes = await getWorkoutVolumesSince(userId, intervalStart);

  const volByMonth = new Map<string, number>();
  for (const m of months) {
    volByMonth.set(utcDayKey(startOfMonth(m)), 0);
  }

  for (const w of workoutVolumes) {
    const mk = utcDayKey(startOfMonth(w.completedAt));
    volByMonth.set(mk, (volByMonth.get(mk) ?? 0) + w.volume);
  }

  return months.map((m) => {
    const k = utcDayKey(startOfMonth(m));
    return {
      key: k,
      label: k.slice(0, 7),
      volume: volByMonth.get(k) ?? 0,
    };
  });
}

/** Running max of estimated 1RM per muscle group, by calendar week. */
export async function getStrengthTrendByMuscleGroup(userId: string, weekCount = 12) {
  const now = new Date();
  const intervalStart = startOfWeek(subWeeks(now, weekCount - 1), { weekStartsOn: 1 });
  const weekStarts = eachWeekOfInterval(
    { start: intervalStart, end: now },
    { weekStartsOn: 1 }
  );

  const allPrs = await prisma.personalRecord.findMany({
    where: { userId, estimated1RM: { not: null, gt: 0 } },
    orderBy: { achievedAt: "asc" },
    select: {
      achievedAt: true,
      estimated1RM: true,
      exercise: { select: { muscleGroup: true } },
    },
  });

  // Group by muscle group
  const prsByGroup = new Map<string, { achievedAt: Date; e1rm: number }[]>();
  for (const pr of allPrs) {
    const mg = pr.exercise.muscleGroup;
    if (!prsByGroup.has(mg)) prsByGroup.set(mg, []);
    prsByGroup.get(mg)!.push({ achievedAt: pr.achievedAt, e1rm: pr.estimated1RM! });
  }

  if (prsByGroup.size === 0) return [];

  const weeks = weekStarts.map((ws) => ({
    key: utcDayKey(startOfWeek(ws, { weekStartsOn: 1 })),
    label: utcDayKey(ws).slice(5),
    end: endOfWeek(ws, { weekStartsOn: 1 }),
  }));

  const groups: { muscleGroup: string; data: { key: string; label: string; bestE1RM: number | null }[] }[] = [];

  for (const [mg, prs] of prsByGroup) {
    let i = 0;
    let runMax = 0;
    const data = weeks.map(({ key, label, end }) => {
      while (i < prs.length && prs[i].achievedAt <= end) {
        runMax = Math.max(runMax, prs[i].e1rm);
        i++;
      }
      return { key, label, bestE1RM: runMax > 0 ? runMax : null };
    });
    groups.push({ muscleGroup: mg, data });
  }

  groups.sort((a, b) => a.muscleGroup.localeCompare(b.muscleGroup));
  return groups;
}

export async function getConsistencyWeekly(userId: string, weekCount = 10) {
  const now = new Date();
  const intervalStart = startOfWeek(subWeeks(now, weekCount - 1), { weekStartsOn: 1 });
  const weekStarts = eachWeekOfInterval(
    { start: intervalStart, end: now },
    { weekStartsOn: 1 }
  );

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      completedAt: { not: null, gte: intervalStart },
    },
    select: { id: true, completedAt: true },
  });

  const countByWeek = new Map<string, number>();
  for (const ws of weekStarts) {
    countByWeek.set(utcDayKey(startOfWeek(ws, { weekStartsOn: 1 })), 0);
  }

  for (const w of workouts) {
    const wk = startOfWeek(w.completedAt!, { weekStartsOn: 1 });
    const key = utcDayKey(wk);
    countByWeek.set(key, (countByWeek.get(key) ?? 0) + 1);
  }

  return weekStarts.map((ws) => {
    const k = utcDayKey(startOfWeek(ws, { weekStartsOn: 1 }));
    return {
      key: k,
      label: k.slice(5),
      workoutCount: countByWeek.get(k) ?? 0,
    };
  });
}

export async function getBodyWeightTrend(userId: string, take = 14) {
  const rows = await prisma.bodyWeight.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take,
  });
  return [...rows]
    .reverse()
    .map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      weight: r.weight,
    }));
}

export async function getNextPlanSession(userId: string) {
  // Strategy 1 lookup + Strategy 2 fallback data fetched in parallel — the
  // fallback queries are cheap and this avoids a sequential waterfall.
  const [lastPlanned, plan, lastWorkout] = await Promise.all([
    prisma.workout.findFirst({
      where: { userId, completedAt: { not: null }, planSessionId: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { planSessionId: true, name: true },
    }),
    prisma.workoutPlan.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        sessions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            _count: { select: { exercises: true } },
          },
        },
      },
    }),
    prisma.workout.findFirst({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { name: true },
    }),
  ]);

  if (lastPlanned?.planSessionId) {
    const planSession = await prisma.planSession.findUnique({
      where: { id: lastPlanned.planSessionId },
      select: {
        order: true,
        plan: {
          select: {
            id: true,
            name: true,
            userId: true,
            sessions: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                name: true,
                order: true,
                _count: { select: { exercises: true } },
              },
            },
          },
        },
      },
    });

    if (planSession && planSession.plan.userId === userId) {
      const sessions = planSession.plan.sessions;
      if (sessions.length > 0) {
        const currentIdx = sessions.findIndex((s) => s.order === planSession.order);
        const nextIdx = (currentIdx + 1) % sessions.length;
        const next = sessions[nextIdx]!;
        return {
          sessionId: next.id,
          sessionName: next.name,
          planId: planSession.plan.id,
          planName: planSession.plan.name,
          exerciseCount: next._count.exercises,
          lastSessionName: lastPlanned.name,
        };
      }
    }
  }

  // Strategy 2: fall back to the user's most recently updated plan.
  // Try to match the last workout's name against a session name to determine
  // position; if no match, default to the first session.
  if (!plan || plan.sessions.length === 0) return null;

  let nextIdx = 0;
  if (lastWorkout?.name) {
    const lower = lastWorkout.name.toLowerCase();
    const matchIdx = plan.sessions.findIndex(
      (s) =>
        lower.includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(lower)
    );
    if (matchIdx !== -1) {
      nextIdx = (matchIdx + 1) % plan.sessions.length;
    }
  }

  const next = plan.sessions[nextIdx]!;
  return {
    sessionId: next.id,
    sessionName: next.name,
    planId: plan.id,
    planName: plan.name,
    exerciseCount: next._count.exercises,
    lastSessionName: lastWorkout?.name ?? null,
  };
}

export async function getRecentWorkouts(userId: string, take = 6) {
  return prisma.workout.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take,
    include: {
      _count: { select: { workoutExercises: true } },
    },
  });
}

export async function getTopExercisesByVolume(
  userId: string,
  options: { days?: number; take?: number } = {}
) {
  const days = options.days ?? 28;
  const take = options.take ?? 5;
  const since = subDays(new Date(), days);

  // Aggregated in SQL — one row per exercise instead of one per set.
  return prisma.$queryRaw<
    Array<{ exerciseId: string; name: string; volume: number }>
  >`
    SELECT we."exerciseId", e.name, SUM(s.reps * s.weight)::float AS volume
    FROM "sets" s
    JOIN "workout_exercises" we ON we.id = s."workoutExerciseId"
    JOIN "workouts" w ON w.id = we."workoutId"
    JOIN "exercises" e ON e.id = we."exerciseId"
    WHERE w."userId" = ${userId}
      AND w."completedAt" IS NOT NULL
      AND w."completedAt" >= ${since}
      AND s."isWarmup" = false
      AND s.reps > 0
      AND s.weight > 0
    GROUP BY we."exerciseId", e.name
    ORDER BY volume DESC
    LIMIT ${take}
  `;
}

export type HeatmapDay = {
  date: string;
  count: number;
  level: number;
  inRange: boolean;
};

export type HeatmapColumn = HeatmapDay[];

export async function getWorkoutHeatmapGrid(
  userId: string,
  weeks = 16
): Promise<HeatmapColumn[]> {
  const today = endOfDay(new Date());
  const gridStart = startOfWeek(subWeeks(today, weeks - 1), { weekStartsOn: 1 });

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      completedAt: { not: null, gte: gridStart, lte: today },
    },
    select: { completedAt: true },
  });

  const counts = new Map<string, number>();
  for (const w of workouts) {
    const k = utcDayKey(w.completedAt!);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const columns: HeatmapColumn[] = [];
  for (let col = 0; col < weeks; col++) {
    const colDays: HeatmapDay[] = [];
    for (let row = 0; row < 7; row++) {
      const d = addDays(gridStart, col * 7 + row);
      const inRange = d <= today;
      const k = utcDayKey(d);
      const count = inRange ? (counts.get(k) ?? 0) : 0;
      colDays.push({ date: k, count, level: 0, inRange });
    }
    columns.push(colDays);
  }

  const flat = columns.flat().filter((c) => c.inRange);
  const max = Math.max(1, ...flat.map((c) => c.count));
  for (const col of columns) {
    for (const c of col) {
      if (!c.inRange) {
        c.level = 0;
        continue;
      }
      c.level =
        c.count === 0 ? 0 : Math.min(4, Math.ceil((c.count / max) * 4));
    }
  }

  return columns;
}

export type NextPlanSession = Awaited<ReturnType<typeof getNextPlanSession>>;

export type DashboardPayload = {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  recentPRs: Awaited<ReturnType<typeof getRecentPersonalRecords>>;
  volumeWeekly: Awaited<ReturnType<typeof getVolumeBucketsWeekly>>;
  volumeMonthly: Awaited<ReturnType<typeof getVolumeBucketsMonthly>>;
  strengthTrendByGroup: Awaited<ReturnType<typeof getStrengthTrendByMuscleGroup>>;
  consistencyWeekly: Awaited<ReturnType<typeof getConsistencyWeekly>>;
  bodyWeightTrend: Awaited<ReturnType<typeof getBodyWeightTrend>>;
  recentWorkouts: Awaited<ReturnType<typeof getRecentWorkouts>>;
  topExercises: Awaited<ReturnType<typeof getTopExercisesByVolume>>;
  heatmap: Awaited<ReturnType<typeof getWorkoutHeatmapGrid>>;
  insights: DashboardInsightItem[];
  nextSession: NextPlanSession;
};

export type DashboardClientPayload = {
  summary: DashboardPayload["summary"];
  recentPRs: Array<{
    id: string;
    exercise: { id: string; name: string };
    weight: number;
    reps: number;
    estimated1RM: number | null;
    achievedAt: string;
  }>;
  volumeWeekly: DashboardPayload["volumeWeekly"];
  volumeMonthly: DashboardPayload["volumeMonthly"];
  strengthTrendByGroup: DashboardPayload["strengthTrendByGroup"];
  consistencyWeekly: DashboardPayload["consistencyWeekly"];
  bodyWeightTrend: DashboardPayload["bodyWeightTrend"];
  recentWorkouts: Array<{
    id: string;
    name: string | null;
    completedAt: string;
    exerciseCount: number;
    durationSeconds: number | null;
  }>;
  topExercises: DashboardPayload["topExercises"];
  heatmap: DashboardPayload["heatmap"];
  insights: DashboardInsightItem[];
  nextSession: NextPlanSession;
};

export function toDashboardClientPayload(raw: DashboardPayload): DashboardClientPayload {
  return {
    summary: raw.summary,
    recentPRs: raw.recentPRs.map((pr) => ({
      id: pr.id,
      exercise: pr.exercise,
      weight: pr.weight,
      reps: pr.reps,
      estimated1RM: pr.estimated1RM,
      achievedAt: pr.achievedAt.toISOString(),
    })),
    volumeWeekly: raw.volumeWeekly,
    volumeMonthly: raw.volumeMonthly,
    strengthTrendByGroup: raw.strengthTrendByGroup,
    consistencyWeekly: raw.consistencyWeekly,
    bodyWeightTrend: raw.bodyWeightTrend,
    recentWorkouts: raw.recentWorkouts.map((w) => ({
      id: w.id,
      name: w.name,
      completedAt: w.completedAt!.toISOString(),
      exerciseCount: w._count.workoutExercises,
      durationSeconds: w.durationSeconds,
    })),
    topExercises: raw.topExercises,
    heatmap: raw.heatmap,
    insights: raw.insights,
    nextSession: raw.nextSession,
  };
}

export async function getDashboardClientPayload(
  userId: string
): Promise<DashboardClientPayload> {
  const tag = dashboardCacheTag(userId);
  return unstable_cache(
    async () => {
      const raw = await getDashboardPayload(userId);
      return toDashboardClientPayload(raw);
    },
    ["dashboard-client", userId],
    { revalidate: 45, tags: [tag] }
  )();
}

export async function getDashboardPayload(userId: string): Promise<DashboardPayload> {
  const [
    summary,
    recentPRs,
    volumeWeekly,
    volumeMonthly,
    strengthTrendByGroup,
    consistencyWeekly,
    bodyWeightTrend,
    recentWorkouts,
    topExercises,
    heatmap,
    insights,
    nextSession,
  ] = await Promise.all([
    getDashboardSummary(userId),
    getRecentPersonalRecords(userId),
    getVolumeBucketsWeekly(userId),
    getVolumeBucketsMonthly(userId),
    getStrengthTrendByMuscleGroup(userId),
    getConsistencyWeekly(userId),
    getBodyWeightTrend(userId),
    getRecentWorkouts(userId),
    getTopExercisesByVolume(userId),
    getWorkoutHeatmapGrid(userId),
    getDashboardInsightItems(userId),
    getNextPlanSession(userId),
  ]);

  return {
    summary,
    recentPRs,
    volumeWeekly,
    volumeMonthly,
    strengthTrendByGroup,
    consistencyWeekly,
    bodyWeightTrend,
    recentWorkouts,
    topExercises,
    heatmap,
    insights,
    nextSession,
  };
}

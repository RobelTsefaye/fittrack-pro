import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  getBodyWeightTrend,
  getConsistencyWeekly,
  getDashboardSummary,
  getRecentPersonalRecords,
  getTopExercisesByVolume,
  getVolumeBucketsDaily,
  getVolumeBucketsWeekly,
} from "@/features/dashboard/queries";
import { getWorkingSetsCountWeekly } from "./week-stats";
import { analyzeDeloadSignals, analyzePlateaus } from "@/features/dashboard/training-insights";
import { getNutritionTrend } from "@/features/health/health-data";

const SCHEMA_VERSION = "1.0";

export async function buildTrainingSummary(userId: string, weeks: number) {
  const dayWindow = Math.min(weeks * 7, 60);

  const [
    user,
    summary,
    volumeWeekly,
    consistency,
    setsWeekly,
    topExercises,
    recentPRs,
    dailyVolume,
    bodyWeightTrend,
    nutrition,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        settings: {
          select: {
            weightUnit: true,
            locale: true,
            restTimerDefault: true,
          },
        },
      },
    }),
    getDashboardSummary(userId),
    getVolumeBucketsWeekly(userId, weeks),
    getConsistencyWeekly(userId, weeks),
    getWorkingSetsCountWeekly(userId, weeks),
    getTopExercisesByVolume(userId, { days: weeks * 7, take: 15 }),
    getRecentPersonalRecords(userId, 10),
    getVolumeBucketsDaily(userId, dayWindow),
    getBodyWeightTrend(userId, dayWindow),
    getNutritionTrend(userId, dayWindow),
  ]);

  const weekBuckets = volumeWeekly.map((v, i) => ({
    weekStart: v.key,
    completedWorkouts: consistency[i]?.workoutCount ?? 0,
    volumeLoad: Math.round(v.volume * 10) / 10,
    workingSets: setsWeekly[i]?.workingSets ?? 0,
  }));

  const totalVolume = weekBuckets.reduce((s, w) => s + w.volumeLoad, 0);
  const totalWorkouts = weekBuckets.reduce((s, w) => s + w.completedWorkouts, 0);
  const totalWorkingSets = weekBuckets.reduce((s, w) => s + w.workingSets, 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "training_summary" as const,
    generatedAt: new Date().toISOString(),
    windowWeeks: weeks,
    athlete: {
      displayName: user?.name ?? "Athlete",
      weightUnit: user?.settings?.weightUnit ?? "KG",
      locale: user?.settings?.locale ?? "EN",
      defaultRestSeconds: user?.settings?.restTimerDefault ?? 90,
    },
    snapshot: summary,
    window: {
      weekBuckets,
      dailyVolume,
      totals: {
        completedWorkouts: totalWorkouts,
        workingSets: totalWorkingSets,
        volumeLoad: Math.round(totalVolume * 10) / 10,
      },
    },
    bodyWeightTrend,
    nutrition,
    topExercisesByVolume: topExercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      volumeLoad: Math.round(e.volume * 10) / 10,
    })),
    recentPersonalRecords: recentPRs.map((pr) => ({
      exerciseId: pr.exerciseId,
      exerciseName: pr.exercise.name,
      weight: pr.weight,
      reps: pr.reps,
      estimated1RM: pr.estimated1RM,
      achievedAt: pr.achievedAt.toISOString(),
    })),
  };
}

export async function buildProgressReport(userId: string, weeks: number) {
  const summaryWeeks = Math.min(weeks, 24);
  const trendWeeks = Math.min(weeks, 52);

  const [trainingBlock, longVolumeWeekly, bodyTrend, top28, topPrior, nutritionTrend] =
    await Promise.all([
      buildTrainingSummary(userId, summaryWeeks),
      getVolumeBucketsWeekly(userId, trendWeeks),
      getBodyWeightTrend(userId, Math.min(weeks * 2, 60)),
      getTopExercisesByVolume(userId, { days: 28, take: 12 }),
      getTopExercisesByVolume(userId, { days: 56, take: 12 }),
      getNutritionTrend(userId, Math.min(weeks * 7, 90)),
    ]);

  const mid = Math.floor(longVolumeWeekly.length / 2) || 1;
  const firstHalf = longVolumeWeekly.slice(0, mid);
  const secondHalf = longVolumeWeekly.slice(mid);
  const volFirst = firstHalf.reduce((s, w) => s + w.volume, 0);
  const volSecond = secondHalf.reduce((s, w) => s + w.volume, 0);

  const bw = bodyTrend;
  let bodyWeightDelta: number | null = null;
  if (bw.length >= 2) {
    bodyWeightDelta = Math.round((bw[bw.length - 1]!.weight - bw[0]!.weight) * 10) / 10;
  }

  const recentPrDate = trainingBlock.recentPersonalRecords[0]?.achievedAt ?? null;
  const prsLast30d = await prisma.personalRecord.count({
    where: {
      userId,
      achievedAt: { gte: subDays(new Date(), 30) },
    },
  });

  const uniqueExercises28d = await prisma.workoutExercise.groupBy({
    by: ["exerciseId"],
    where: {
      workout: {
        userId,
        completedAt: { not: null, gte: subDays(new Date(), 28) },
      },
    },
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "progress_report" as const,
    generatedAt: new Date().toISOString(),
    requestedWeeks: weeks,
    trainingSummaryWeeks: summaryWeeks,
    volumeTrendWeeks: trendWeeks,
    training: trainingBlock,
    analysis: {
      volumeTrend: {
        firstHalfVolumeLoad: Math.round(volFirst * 10) / 10,
        secondHalfVolumeLoad: Math.round(volSecond * 10) / 10,
        percentChangeHalfToHalf:
          volFirst > 0
            ? Math.round(((volSecond - volFirst) / volFirst) * 1000) / 10
            : null,
      },
      bodyWeight: {
        entriesInSample: bw.length,
        firstWeight: bw[0]?.weight ?? null,
        lastWeight: bw[bw.length - 1]?.weight ?? null,
        deltaInSample: bodyWeightDelta,
        series: bw,
      },
      nutrition: nutritionTrend,
      personalRecordsLast30Days: prsLast30d,
      mostRecentPersonalRecordAt: recentPrDate,
      uniqueExercisesTouchedLast28Days: uniqueExercises28d.length,
    },
    topExercisesRolling28d: top28.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      volumeLoad: Math.round(e.volume * 10) / 10,
    })),
    topExercisesRolling56d: topPrior.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      volumeLoad: Math.round(e.volume * 10) / 10,
    })),
  };
}

export type AiRecommendation = {
  id: string;
  priority: "info" | "suggest" | "attention";
  title: string;
  detail: string;
  basedOn: string;
};

export async function buildHeuristicRecommendations(userId: string): Promise<AiRecommendation[]> {
  const out: AiRecommendation[] = [];

  const lastWorkout = await prisma.workout.findFirst({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  const daysSinceLast =
    lastWorkout?.completedAt != null
      ? Math.floor(
          (Date.now() - lastWorkout.completedAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      : null;

  if (daysSinceLast == null) {
    out.push({
      id: "no-history",
      priority: "info",
      title: "Build a baseline",
      detail:
        "Log a few completed workouts with working sets so trends and suggestions become meaningful.",
      basedOn: "completedWorkouts=0",
    });
    return out;
  }

  if (daysSinceLast >= 14) {
    out.push({
      id: "inactive",
      priority: "attention",
      title: "Time away from the gym",
      detail: `Last completed workout was about ${daysSinceLast} days ago. Consider a light return session focusing on form and RPE 6–7.`,
      basedOn: `daysSinceLastWorkout=${daysSinceLast}`,
    });
  } else if (daysSinceLast >= 7) {
    out.push({
      id: "stale",
      priority: "suggest",
      title: "Consistency check-in",
      detail: "A week without a logged session is common — schedule your next workout to protect momentum.",
      basedOn: `daysSinceLastWorkout=${daysSinceLast}`,
    });
  }

  const vol = await getVolumeBucketsWeekly(userId, 8);
  const first4 = vol.slice(0, 4).reduce((s, w) => s + w.volume, 0);
  const last4 = vol.slice(4, 8).reduce((s, w) => s + w.volume, 0);
  if (first4 > 100 && last4 < first4 * 0.5) {
    out.push({
      id: "volume-drop",
      priority: "suggest",
      title: "Training volume dropped",
      detail:
        "Recent weekly volume is much lower than the prior block. Rule out fatigue, schedule, or injury; adjust load or deload if recovery is poor.",
      basedOn: "volumeCompare:last4WeeksVsPrior4",
    });
  }

  const prRecent = await prisma.personalRecord.findFirst({
    where: { userId, achievedAt: { gte: subDays(new Date(), 7) } },
    orderBy: { achievedAt: "desc" },
    include: { exercise: { select: { name: true } } },
  });
  if (prRecent) {
    out.push({
      id: "pr-celebrate",
      priority: "info",
      title: "Recent PR",
      detail: `New personal record on ${prRecent.exercise.name} (${prRecent.weight}×${prRecent.reps}).`,
      basedOn: "personalRecord:last7d",
    });
  }

  const top = await getTopExercisesByVolume(userId, { days: 28, take: 3 });
  const totalVol = top.reduce((s, e) => s + e.volume, 0);
  if (totalVol > 0 && top[0] && top[0].volume / totalVol >= 0.45) {
    out.push({
      id: "concentration",
      priority: "suggest",
      title: "Volume concentration",
      detail: `A large share of recent volume comes from ${top[0].name}. Consider accessory and antagonist work for balance if your goals allow.`,
      basedOn: "topExerciseVolumeShare>=0.45",
    });
  }

  const summary = await getDashboardSummary(userId);
  if (summary.workoutStreakDays >= 5) {
    out.push({
      id: "streak",
      priority: "info",
      title: "Streak active",
      detail: `${summary.workoutStreakDays}-day training streak. Keep one easy or mobility day if fatigue accumulates.`,
      basedOn: `workoutStreakDays=${summary.workoutStreakDays}`,
    });
  }

  const deloads = await analyzeDeloadSignals(userId);
  for (const d of deloads) {
    if (d.reason === "high_frequency") {
      out.push({
        id: "deload-frequency",
        priority: "attention",
        title: "High training frequency",
        detail: `${d.workoutsLast21Days} sessions logged in the last 21 days. If sleep, joints, or mood are suffering, schedule a lighter recovery week.`,
        basedOn: `completedWorkouts:last21d=${d.workoutsLast21Days}`,
      });
    } else {
      out.push({
        id: "deload-grind",
        priority: "suggest",
        title: "Recovery / deload candidate",
        detail: `${d.workoutsLast28Days} sessions in 28 days with no PR in the last 21. A short deload or easier week can help break stalls.`,
        basedOn: `sessions28d=${d.workoutsLast28Days};prs21d=0`,
      });
    }
  }

  const plateaus = await analyzePlateaus(userId);
  for (const p of plateaus) {
    out.push({
      id: `plateau-${p.exerciseId}`,
      priority: "suggest",
      title: `Possible plateau: ${p.exerciseName}`,
      detail: `Estimated 1RM moved little between the first and second half of the last ~8 weeks (about ${p.bestFirstHalf} → ${p.bestSecondHalf}). Try varying reps, a double-progression week, or a deload before pushing loads again.`,
      basedOn: `epley1RM:half1=${p.bestFirstHalf};half2=${p.bestSecondHalf}`,
    });
  }

  return out;
}

/** Snapshot for LLM Q&A: weight, in-progress sessions, plan rotation “next day”, recent history. */
export async function buildCoachContext(userId: string) {
  const [latestBw, bodyWeightTrend, nutrition, activeWorkouts, plans, recentWorkouts] =
    await Promise.all([
    prisma.bodyWeight.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
      select: { weight: true, date: true, notes: true },
    }),
    getBodyWeightTrend(userId, 30),
    getNutritionTrend(userId, 7),
    prisma.workout.findMany({
      where: { userId, completedAt: null },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: {
        workoutExercises: {
          orderBy: { order: "asc" },
          include: { exercise: { select: { name: true } } },
        },
      },
    }),
    prisma.workoutPlan.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        sessions: {
          orderBy: { order: "asc" },
          include: {
            exercises: {
              orderBy: { order: "asc" },
              include: { exercise: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        completedAt: true,
        durationSeconds: true,
        planSessionId: true,
      },
    }),
  ]);

  const sessionIds = plans.flatMap((p) => p.sessions.map((s) => s.id));
  const lastBySession = new Map<string, Date>();
  if (sessionIds.length > 0) {
    const completions = await prisma.workout.groupBy({
      by: ["planSessionId"],
      where: {
        userId,
        completedAt: { not: null },
        planSessionId: { in: sessionIds },
      },
      _max: { completedAt: true },
    });
    for (const row of completions) {
      if (row.planSessionId && row._max.completedAt) {
        lastBySession.set(row.planSessionId, row._max.completedAt);
      }
    }
  }

  const planRotation = plans.map((plan) => {
    if (plan.sessions.length === 0) {
      return {
        planId: plan.id,
        planName: plan.name,
        sessions: [] as Array<{
          id: string;
          name: string;
          order: number;
          lastCompletedAt: string | null;
          plannedExercises: Array<{ name: string; targetSets: number }>;
        }>,
        suggestedNext: null as {
          planSessionId: string;
          sessionName: string;
          reason: string;
          plannedExercises: Array<{ name: string; targetSets: number }>;
        } | null,
      };
    }

    const sessionsDetail = plan.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      lastCompletedAt: lastBySession.get(s.id)?.toISOString() ?? null,
      plannedExercises: s.exercises.map((e) => ({
        name: e.exercise.name,
        targetSets: e.targetSets,
      })),
    }));

    const scored = plan.sessions.map((s) => ({
      session: s,
      lastAt: lastBySession.get(s.id) ?? null,
    }));
    scored.sort((a, b) => {
      if (a.lastAt === null && b.lastAt !== null) return -1;
      if (a.lastAt !== null && b.lastAt === null) return 1;
      if (a.lastAt === null && b.lastAt === null) return a.session.order - b.session.order;
      const t = a.lastAt!.getTime() - b.lastAt!.getTime();
      if (t !== 0) return t;
      return a.session.order - b.session.order;
    });
    const pick = scored[0]!.session;
    const lastDone = lastBySession.get(pick.id);
    const reason = lastDone
      ? `Least-recent plan day in this plan (last done ${lastDone.toISOString().slice(0, 10)}).`
      : "No completed workout linked to this plan day yet — good candidate to run next.";

    return {
      planId: plan.id,
      planName: plan.name,
      sessions: sessionsDetail,
      suggestedNext: {
        planSessionId: pick.id,
        sessionName: pick.name,
        reason,
        plannedExercises: pick.exercises.map((e) => ({
          name: e.exercise.name,
          targetSets: e.targetSets,
        })),
      },
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "coach_context" as const,
    generatedAt: new Date().toISOString(),
    latestBodyWeight: latestBw
      ? {
          weight: latestBw.weight,
          date: latestBw.date.toISOString().slice(0, 10),
          notes: latestBw.notes,
        }
      : null,
    bodyWeightTrend,
    nutrition,
    activeWorkouts: activeWorkouts.map((w) => ({
      id: w.id,
      name: w.name,
      startedAt: w.startedAt.toISOString(),
      exerciseNames: w.workoutExercises.map((we) => we.exercise.name),
    })),
    planRotation,
    primaryPlanId: plans[0]?.id ?? null,
    recentCompletedWorkouts: recentWorkouts.map((w) => ({
      id: w.id,
      name: w.name,
      completedAt: w.completedAt!.toISOString(),
      durationSeconds: w.durationSeconds,
      planSessionId: w.planSessionId,
    })),
    llmHints: [
      "latestBodyWeight is the most recent logged entry (not necessarily today).",
      "bodyWeightTrend is up to the last 30 logged entries (not necessarily daily — only days with a logged weigh-in appear).",
      "nutrition covers the last 7 days from HealthSnapshot; days without a logged entry have null values and are excluded from averages/macroSplit.",
      "If activeWorkouts is non-empty, mention finishing or discarding the in-progress session before starting something new.",
      "suggestedNext uses rotation within each plan: pick the plan session with the oldest last completion (or never) among workouts that set planSessionId when started from the plan.",
      "Without plans, infer 'next' from recentCompletedWorkouts and GET /api/ai/recommendations only.",
    ],
  };
}

import { prisma } from "@/lib/prisma";
import type { RecoveryLevel } from "./types";

export type RecoveryBreakdown = {
  score: number;
  level: RecoveryLevel;
  sleepScore: number | null;
  hrScore: number | null;
  hrvScore: number | null;
  loadScore: number | null;
  activityScore: number | null;
  trends: {
    hrTrend: "rising" | "stable" | "falling" | null;
    hrvTrend: "rising" | "stable" | "falling" | null;
  };
  baseline: {
    restingHR: number | null;
    hrv: number | null;
    steps: number | null;
    activeCalories: number | null;
    daysOfData: number;
  };
  trainingLoad: {
    acwr: number | null;
    daysSinceLast: number | null;
    consecutiveDays: number;
    acute7dTonnage: number | null;
    chronic28dAvgTonnage: number | null;
    lastTonnage: number | null;
    intensity: "high" | "medium" | "low" | null;
  };
};

export type RecoveryHistoryPoint = {
  date: string; // YYYY-MM-DD
  score: number;
  level: RecoveryLevel;
};

const WEIGHTS = { sleep: 0.20, hr: 0.15, hrv: 0.25, load: 0.30, activity: 0.10 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Math helpers ────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xBar = (n - 1) / 2;
  const yBar = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  values.forEach((y, x) => {
    num += (x - xBar) * (y - yBar);
    den += (x - xBar) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Sub-score functions ─────────────────────────────────────────────────────

function sleepScore(hours: number, quality: number | null): number {
  let base: number;
  if (hours >= 8) base = 100;
  else if (hours >= 7) base = 85;
  else if (hours >= 6) base = 65;
  else if (hours >= 5) base = 40;
  else base = 15;
  return quality != null ? Math.round(base * 0.6 + quality * 0.4) : base;
}

function hrRatioScore(ratio: number): number {
  if (ratio <= 0.95) return 100;
  if (ratio <= 1.0) return 85;
  if (ratio <= 1.05) return 65;
  if (ratio <= 1.1) return 40;
  return 20;
}

function hrAbsoluteScore(hr: number): number {
  if (hr <= 50) return 100;
  if (hr <= 60) return 85;
  if (hr <= 70) return 65;
  if (hr <= 80) return 40;
  return 20;
}

function hrvRatioScore(ratio: number): number {
  if (ratio >= 1.1) return 100;
  if (ratio >= 1.0) return 85;
  if (ratio >= 0.9) return 65;
  if (ratio >= 0.8) return 40;
  return 20;
}

function hrvAbsoluteScore(hrv: number): number {
  if (hrv >= 80) return 100;
  if (hrv >= 60) return 85;
  if (hrv >= 40) return 65;
  if (hrv >= 25) return 40;
  return 20;
}

function acwrScore(acwr: number): number {
  if (acwr < 0.5) return 90;
  if (acwr < 0.8) return 95;
  if (acwr < 1.0) return 100;
  if (acwr < 1.3) return 80;
  if (acwr < 1.5) return 50;
  return 25;
}

function activityLoadScore(ratio: number): number {
  if (ratio < 0.7) return 100;
  if (ratio < 1.0) return 88;
  if (ratio < 1.3) return 75;
  if (ratio < 1.6) return 58;
  return 40;
}

// ── Data shapes (decoupled from Prisma so the pure scorer is testable) ─────

type SnapshotLike = {
  date: Date;
  sleepDuration: number | null;
  sleepQuality: number | null;
  restingHeartRate: number | null;
  hrv: number | null;
  steps: number | null;
  activeCalories: number | null;
};

type WorkoutLike = { completedAt: Date; tonnage: number | null };

const EMPTY_BREAKDOWN: RecoveryBreakdown = {
  score: 0, level: "none",
  sleepScore: null, hrScore: null, hrvScore: null, loadScore: null, activityScore: null,
  trends: { hrTrend: null, hrvTrend: null },
  baseline: { restingHR: null, hrv: null, steps: null, activeCalories: null, daysOfData: 0 },
  trainingLoad: {
    acwr: null, daysSinceLast: null, consecutiveDays: 0,
    acute7dTonnage: null, chronic28dAvgTonnage: null, lastTonnage: null, intensity: null,
  },
};

// ── Pure scoring function ───────────────────────────────────────────────────
// Computes a recovery breakdown for a given moment in time, given the data
// available up to that point. Used by both the live endpoint and the history
// computation.

export function scoreFromData(
  asOfMs: number,
  allSnapshots: SnapshotLike[],
  allWorkouts: WorkoutLike[],
): RecoveryBreakdown {
  const asOfDayIdx = Math.floor(asOfMs / DAY_MS);

  // Snapshots ≤ asOf, sorted ascending
  const snapshots = allSnapshots
    .filter((s) => Math.floor(s.date.getTime() / DAY_MS) <= asOfDayIdx)
    .slice(-29); // 28 baseline + 1 current
  if (snapshots.length === 0) return EMPTY_BREAKDOWN;

  // "Today" = the most recent snapshot on or before asOf (some users skip days)
  const today = snapshots[snapshots.length - 1]!;
  const baselineWindow = snapshots.slice(0, -1);
  const baseline14 = baselineWindow.slice(-14);

  const hrValues = baseline14.map((s) => s.restingHeartRate).filter((v): v is number => v != null);
  const hrvValues = baseline14.map((s) => s.hrv).filter((v): v is number => v != null);
  const stepsValues = baseline14.map((s) => s.steps).filter((v): v is number => v != null);
  const calValues = baseline14.map((s) => s.activeCalories).filter((v): v is number => v != null);

  const hrBaseline = hrValues.length >= 7 ? median(hrValues) : null;
  const hrvBaseline = hrvValues.length >= 7 ? median(hrvValues) : null;
  const stepsBaseline = stepsValues.length >= 5 ? median(stepsValues) : null;
  const calBaseline = calValues.length >= 5 ? median(calValues) : null;

  // 3-day trends
  const trend3hr = baseline14.slice(-3).map((s) => s.restingHeartRate).filter((v): v is number => v != null);
  const trend3hrv = baseline14.slice(-3).map((s) => s.hrv).filter((v): v is number => v != null);
  const hrSlope = linearSlope(trend3hr);
  const hrvSlope = linearSlope(trend3hrv);

  const hrTrend: RecoveryBreakdown["trends"]["hrTrend"] =
    trend3hr.length < 2 ? null
    : hrSlope > 0.5 ? "rising"
    : hrSlope < -0.5 ? "falling"
    : "stable";
  const hrvTrend: RecoveryBreakdown["trends"]["hrvTrend"] =
    trend3hrv.length < 2 ? null
    : hrvSlope > 1.0 ? "rising"
    : hrvSlope < -1.0 ? "falling"
    : "stable";

  // Sleep
  const sleepSc = today.sleepDuration != null
    ? sleepScore(today.sleepDuration, today.sleepQuality)
    : null;

  // HR (ratio + trend adjustment)
  let hrSc: number | null = null;
  if (today.restingHeartRate != null) {
    const base = hrBaseline != null
      ? hrRatioScore(today.restingHeartRate / hrBaseline)
      : hrAbsoluteScore(today.restingHeartRate);
    const trendAdj =
      hrTrend === "rising" ? (hrSlope > 1.5 ? -15 : -8)
      : hrTrend === "falling" ? 5
      : 0;
    hrSc = clamp(base + trendAdj, 5, 100);
  }

  // HRV (ratio + trend adjustment)
  let hrvSc: number | null = null;
  if (today.hrv != null) {
    const base = hrvBaseline != null
      ? hrvRatioScore(today.hrv / hrvBaseline)
      : hrvAbsoluteScore(today.hrv);
    const trendAdj =
      hrvTrend === "falling" ? (hrvSlope < -3 ? -15 : -8)
      : hrvTrend === "rising" ? 8
      : 0;
    hrvSc = clamp(base + trendAdj, 5, 100);
  }

  // Workouts ≤ asOf, within last 28 days
  const cutoff28 = asOfMs - 28 * DAY_MS;
  const loggedWorkouts = allWorkouts
    .filter((w) => w.completedAt.getTime() <= asOfMs && w.completedAt.getTime() >= cutoff28)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  let loadSc: number | null = null;
  let daysSinceLast: number | null = null;
  let consecutiveDays = 0;
  let lastTonnage: number | null = null;
  let acwr: number | null = null;
  let acute7dTonnage: number | null = null;
  let chronic28dAvgTonnage: number | null = null;
  let intensity: "high" | "medium" | "low" | null = null;

  if (loggedWorkouts.length > 0) {
    const last = loggedWorkouts[0]!;
    daysSinceLast = asOfDayIdx - Math.floor(last.completedAt.getTime() / DAY_MS);
    lastTonnage = last.tonnage;

    const workoutDaySet = new Set(
      loggedWorkouts.map((w) => Math.floor(w.completedAt.getTime() / DAY_MS)),
    );
    const lastDay = Math.floor(last.completedAt.getTime() / DAY_MS);
    consecutiveDays = 1;
    while (workoutDaySet.has(lastDay - consecutiveDays)) consecutiveDays++;

    const cutoff7 = asOfMs - 7 * DAY_MS;
    const withTonnage = loggedWorkouts.filter((w) => w.tonnage != null) as Array<{ completedAt: Date; tonnage: number }>;
    const hasTonnage = withTonnage.length > 0;

    if (hasTonnage) {
      const acute7 = withTonnage
        .filter((w) => w.completedAt.getTime() >= cutoff7)
        .reduce((s, w) => s + w.tonnage, 0);
      const chronic28Sum = withTonnage.reduce((s, w) => s + w.tonnage, 0);
      const chronic28Avg = chronic28Sum / 4;
      acute7dTonnage = acute7;
      chronic28dAvgTonnage = chronic28Avg;

      if (chronic28Avg > 0) {
        acwr = acute7 / chronic28Avg;
        let base = acwrScore(acwr);
        if (consecutiveDays >= 2) {
          const mul = Math.max(0.60, 1 - (consecutiveDays - 1) * 0.15);
          base = Math.round(base * mul);
        }
        loadSc = base;
        const dailyChronicAvg = chronic28Avg / 7;
        if (lastTonnage != null && dailyChronicAvg > 0) {
          const r = lastTonnage / dailyChronicAvg;
          intensity = r >= 1.3 ? "high" : r <= 0.7 ? "low" : "medium";
        }
      } else {
        const base = daysSinceLast === 0 ? 45 : daysSinceLast === 1 ? 75 : daysSinceLast === 2 ? 90 : 100;
        const mul = Math.max(0.60, 1 - Math.max(0, consecutiveDays - 1) * 0.15);
        loadSc = Math.round(base * mul);
        intensity = "medium";
      }
    } else {
      const acute7Count = loggedWorkouts.filter((w) => w.completedAt.getTime() >= cutoff7).length;
      const chronic28AvgCount = loggedWorkouts.length / 4;
      if (chronic28AvgCount > 0) {
        acwr = acute7Count / chronic28AvgCount;
        let base = acwrScore(acwr);
        if (consecutiveDays >= 2) {
          const mul = Math.max(0.60, 1 - (consecutiveDays - 1) * 0.15);
          base = Math.round(base * mul);
        }
        loadSc = base;
      } else {
        const base = daysSinceLast === 0 ? 45 : daysSinceLast === 1 ? 75 : daysSinceLast === 2 ? 90 : 100;
        const mul = Math.max(0.60, 1 - Math.max(0, consecutiveDays - 1) * 0.15);
        loadSc = Math.round(base * mul);
      }
      intensity = "medium";
    }
  } else {
    loadSc = 100;
  }

  // Activity
  let actSc: number | null = null;
  const stepsRatio = today.steps != null && stepsBaseline != null && stepsBaseline > 0
    ? today.steps / stepsBaseline : null;
  const calRatio = today.activeCalories != null && calBaseline != null && calBaseline > 0
    ? today.activeCalories / calBaseline : null;
  if (stepsRatio != null || calRatio != null) {
    const ratios = [stepsRatio, calRatio].filter((v): v is number => v != null);
    const avgRatio = ratios.reduce((s, v) => s + v, 0) / ratios.length;
    actSc = activityLoadScore(avgRatio);
  }

  // Composite
  const factors: Array<{ value: number; weight: number }> = [];
  if (sleepSc != null) factors.push({ value: sleepSc, weight: WEIGHTS.sleep });
  if (hrSc    != null) factors.push({ value: hrSc,    weight: WEIGHTS.hr });
  if (hrvSc   != null) factors.push({ value: hrvSc,   weight: WEIGHTS.hrv });
  if (loadSc  != null) factors.push({ value: loadSc,  weight: WEIGHTS.load });
  if (actSc   != null) factors.push({ value: actSc,   weight: WEIGHTS.activity });

  if (factors.length === 0) return EMPTY_BREAKDOWN;

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(
    factors.reduce((s, f) => s + (f.value * f.weight) / totalWeight, 0),
  );
  const level: RecoveryLevel = score >= 75 ? "high" : score >= 50 ? "mid" : "low";

  return {
    score, level,
    sleepScore: sleepSc, hrScore: hrSc, hrvScore: hrvSc,
    loadScore: loadSc, activityScore: actSc,
    trends: { hrTrend, hrvTrend },
    baseline: {
      restingHR: hrBaseline, hrv: hrvBaseline,
      steps: stepsBaseline, activeCalories: calBaseline,
      daysOfData: Math.max(hrValues.length, hrvValues.length),
    },
    trainingLoad: {
      acwr, daysSinceLast, consecutiveDays,
      acute7dTonnage, chronic28dAvgTonnage, lastTonnage, intensity,
    },
  };
}

// ── Data fetching ───────────────────────────────────────────────────────────

async function fetchSnapshotsAndWorkouts(userId: string, sinceMs: number) {
  const since = new Date(sinceMs);
  since.setUTCHours(0, 0, 0, 0);

  const [snapshots, workouts] = await Promise.all([
    prisma.healthSnapshot.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.workout.findMany({
      where: { userId, completedAt: { gte: since, not: null } },
      orderBy: { completedAt: "desc" },
      include: {
        workoutExercises: {
          include: {
            sets: {
              where: { isWarmup: false, isCompleted: true },
              select: { weight: true, reps: true },
            },
          },
        },
      },
    }),
  ]);

  const workoutsLike: WorkoutLike[] = workouts
    .filter((w): w is typeof w & { completedAt: Date } => w.completedAt != null)
    .map((w) => {
      const t = w.workoutExercises
        .flatMap((we) => we.sets)
        .reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0);
      return { completedAt: w.completedAt, tonnage: t > 0 ? t : null };
    });

  return { snapshots: snapshots as SnapshotLike[], workouts: workoutsLike };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function computeRecovery(userId: string): Promise<RecoveryBreakdown> {
  const now = Date.now();
  const { snapshots, workouts } = await fetchSnapshotsAndWorkouts(userId, now - 28 * DAY_MS);
  return scoreFromData(now, snapshots, workouts);
}

// Returns one score per day for the last `days` days (ending today).
// Days where the user has no snapshot are skipped (so the chart shows gaps).
export async function computeRecoveryHistory(
  userId: string,
  days: number = 30,
): Promise<RecoveryHistoryPoint[]> {
  const now = Date.now();
  // Need 28 days of context BEFORE the earliest history day
  const { snapshots, workouts } = await fetchSnapshotsAndWorkouts(userId, now - (28 + days) * DAY_MS);
  if (snapshots.length === 0) return [];

  // Set of days the user actually has a snapshot for
  const snapshotDays = new Set(snapshots.map((s) => Math.floor(s.date.getTime() / DAY_MS)));

  const todayDayIdx = Math.floor(now / DAY_MS);
  const points: RecoveryHistoryPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayIdx = todayDayIdx - i;
    if (!snapshotDays.has(dayIdx)) continue;
    // Anchor "now" at end of that calendar day so the scorer treats it as the current day
    const asOfMs = (dayIdx + 1) * DAY_MS - 1;
    const breakdown = scoreFromData(asOfMs, snapshots, workouts);
    if (breakdown.level === "none") continue;
    const date = new Date(dayIdx * DAY_MS).toISOString().slice(0, 10);
    points.push({ date, score: breakdown.score, level: breakdown.level });
  }

  return points;
}

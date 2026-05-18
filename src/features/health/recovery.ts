import { prisma } from "@/lib/prisma";
import type { RecoveryLevel } from "./types";

export type RecoveryBreakdown = {
  score: number;
  level: RecoveryLevel;
  sleepScore: number | null;
  hrScore: number | null;
  hrvScore: number | null;
  loadScore: number | null;
  baseline: {
    restingHR: number | null;
    hrv: number | null;
    daysOfData: number;
  };
  trainingLoad: {
    daysSinceLast: number | null;
    lastTonnage: number | null;
    recentAvgTonnage: number | null;
    intensity: "high" | "medium" | "low" | null;
  };
};

const WEIGHTS = { sleep: 0.3, hr: 0.2, hrv: 0.3, load: 0.2 } as const;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function sleepScore(hours: number): number {
  if (hours >= 8) return 100;
  if (hours >= 7) return 85;
  if (hours >= 6) return 65;
  if (hours >= 5) return 40;
  return 15;
}

function hrRatioScore(ratio: number): number {
  // Lower = better. ratio = today / baseline.
  if (ratio <= 0.95) return 100;
  if (ratio <= 1.0) return 85;
  if (ratio <= 1.05) return 65;
  if (ratio <= 1.1) return 40;
  return 20;
}

function hrvRatioScore(ratio: number): number {
  // Higher = better.
  if (ratio >= 1.1) return 100;
  if (ratio >= 1.0) return 85;
  if (ratio >= 0.9) return 65;
  if (ratio >= 0.8) return 40;
  return 20;
}

function hrAbsoluteScore(hr: number): number {
  if (hr <= 50) return 100;
  if (hr <= 60) return 85;
  if (hr <= 70) return 65;
  if (hr <= 80) return 40;
  return 20;
}

function hrvAbsoluteScore(hrv: number): number {
  if (hrv >= 80) return 100;
  if (hrv >= 60) return 85;
  if (hrv >= 40) return 65;
  if (hrv >= 25) return 40;
  return 20;
}

const LOAD_MATRIX: Record<number, Record<"high" | "medium" | "low", number>> = {
  0: { high: 30, medium: 45, low: 60 },
  1: { high: 60, medium: 75, low: 85 },
  2: { high: 85, medium: 92, low: 97 },
  3: { high: 100, medium: 100, low: 100 },
};

function loadScoreFor(
  daysSinceLast: number,
  intensity: "high" | "medium" | "low",
): number {
  const row = LOAD_MATRIX[Math.min(daysSinceLast, 3)];
  return row[intensity];
}

export async function computeRecovery(userId: string): Promise<RecoveryBreakdown> {
  const empty: RecoveryBreakdown = {
    score: 0,
    level: "none",
    sleepScore: null,
    hrScore: null,
    hrvScore: null,
    loadScore: null,
    baseline: { restingHR: null, hrv: null, daysOfData: 0 },
    trainingLoad: {
      daysSinceLast: null,
      lastTonnage: null,
      recentAvgTonnage: null,
      intensity: null,
    },
  };

  // Pull last 15 days of snapshots (today + 14 baseline days)
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 14);

  const snapshots = await prisma.healthSnapshot.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  if (snapshots.length === 0) return empty;

  const today = snapshots[snapshots.length - 1];
  const baselineWindow = snapshots.slice(0, -1); // exclude today

  // Baselines: median of last 14 days, need at least 7 datapoints
  const hrValues = baselineWindow.map((s) => s.restingHeartRate).filter((v): v is number => v != null);
  const hrvValues = baselineWindow.map((s) => s.hrv).filter((v): v is number => v != null);
  const hrBaseline = hrValues.length >= 7 ? median(hrValues) : null;
  const hrvBaseline = hrvValues.length >= 7 ? median(hrvValues) : null;

  // Sub-scores
  const sleepSc = today.sleepDuration != null ? sleepScore(today.sleepDuration) : null;

  let hrSc: number | null = null;
  if (today.restingHeartRate != null) {
    hrSc = hrBaseline != null
      ? hrRatioScore(today.restingHeartRate / hrBaseline)
      : hrAbsoluteScore(today.restingHeartRate);
  }

  let hrvSc: number | null = null;
  if (today.hrv != null) {
    hrvSc = hrvBaseline != null
      ? hrvRatioScore(today.hrv / hrvBaseline)
      : hrvAbsoluteScore(today.hrv);
  }

  // Training load: completed workouts in last 14 days with completed non-warmup sets
  const loadSince = new Date();
  loadSince.setUTCHours(0, 0, 0, 0);
  loadSince.setUTCDate(loadSince.getUTCDate() - 14);

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      completedAt: { gte: loadSince, not: null },
    },
    orderBy: { completedAt: "desc" },
    include: {
      workoutExercises: {
        include: {
          sets: {
            where: { isWarmup: false, isCompleted: true, weight: { not: null }, reps: { not: null } },
            select: { weight: true, reps: true },
          },
        },
      },
    },
  });

  type LoggedWorkout = { completedAt: Date; tonnage: number };
  const loggedWorkouts: LoggedWorkout[] = workouts
    .map((w) => {
      const tonnage = w.workoutExercises
        .flatMap((we) => we.sets)
        .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
      return w.completedAt && tonnage > 0
        ? { completedAt: w.completedAt, tonnage }
        : null;
    })
    .filter((w): w is LoggedWorkout => w != null);

  let loadSc: number | null = null;
  let daysSinceLast: number | null = null;
  let lastTonnage: number | null = null;
  let recentAvgTonnage: number | null = null;
  let intensity: "high" | "medium" | "low" | null = null;

  if (loggedWorkouts.length > 0) {
    const last = loggedWorkouts[0];
    const ms = Date.now() - last.completedAt.getTime();
    daysSinceLast = Math.floor(ms / (24 * 60 * 60 * 1000));
    lastTonnage = last.tonnage;

    const recent7Cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent7 = loggedWorkouts.filter((w) => w.completedAt.getTime() >= recent7Cutoff);
    if (recent7.length > 0) {
      recentAvgTonnage = recent7.reduce((s, w) => s + w.tonnage, 0) / recent7.length;
      const ratio = lastTonnage / recentAvgTonnage;
      intensity = ratio >= 1.15 ? "high" : ratio <= 0.85 ? "low" : "medium";
    } else {
      intensity = "medium";
    }

    loadSc = loadScoreFor(daysSinceLast, intensity);
  } else {
    // No recent training → fully rested
    loadSc = 100;
    intensity = null;
  }

  // Weighted score, auto-renormalize when factors are missing
  const factors: Array<{ value: number; weight: number }> = [];
  if (sleepSc != null) factors.push({ value: sleepSc, weight: WEIGHTS.sleep });
  if (hrSc != null) factors.push({ value: hrSc, weight: WEIGHTS.hr });
  if (hrvSc != null) factors.push({ value: hrvSc, weight: WEIGHTS.hrv });
  if (loadSc != null) factors.push({ value: loadSc, weight: WEIGHTS.load });

  if (factors.length === 0) return empty;

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(
    factors.reduce((s, f) => s + (f.value * f.weight) / totalWeight, 0),
  );

  const level: RecoveryLevel =
    score >= 75 ? "high" : score >= 50 ? "mid" : "low";

  return {
    score,
    level,
    sleepScore: sleepSc,
    hrScore: hrSc,
    hrvScore: hrvSc,
    loadScore: loadSc,
    baseline: {
      restingHR: hrBaseline,
      hrv: hrvBaseline,
      daysOfData: Math.max(hrValues.length, hrvValues.length),
    },
    trainingLoad: {
      daysSinceLast,
      lastTonnage,
      recentAvgTonnage,
      intensity,
    },
  };
}

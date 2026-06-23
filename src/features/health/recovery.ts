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
    /** Per-metric day counts so the UI can show the real basis instead of a fixed "14d" label */
    hrDays: number;
    hrvDays: number;
    stepsDays: number;
    calDays: number;
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

/**
 * Piecewise-linear interpolation between (x, y) anchor points.
 * Anchors must be sorted by x ascending. Values outside the range
 * clamp to the nearest edge anchor.
 */
function interpolate(x: number, anchors: ReadonlyArray<readonly [number, number]>): number {
  if (anchors.length === 0) return 0;
  if (x <= anchors[0]![0]) return anchors[0]![1];
  if (x >= anchors[anchors.length - 1]![0]) return anchors[anchors.length - 1]![1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i]!;
    const [x1, y1] = anchors[i + 1]!;
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return anchors[anchors.length - 1]![1];
}

// ── Sub-score functions ─────────────────────────────────────────────────────
// Each function uses continuous linear interpolation between physiologically
// meaningful anchor points instead of discrete bands. Small differences in
// input now produce small differences in output (no step changes between
// adjacent days with similar data).

const SLEEP_ANCHORS = [
  [0,  0], [4,  10], [5, 40], [6, 65], [7, 85], [8, 100], [10, 100],
] as const;

function sleepScore(hours: number, quality: number | null): number {
  const base = interpolate(hours, SLEEP_ANCHORS);
  return quality != null
    ? Math.round(base * 0.6 + quality * 0.4)
    : Math.round(base);
}

// Resting-HR ratio (today / 14d baseline). Lower = better.
const HR_RATIO_ANCHORS = [
  [0.80, 100], [0.95, 100], [1.0, 85], [1.05, 65], [1.10, 40], [1.20, 20], [1.50, 20],
] as const;

function hrRatioScore(ratio: number): number {
  return Math.round(interpolate(ratio, HR_RATIO_ANCHORS));
}

// Absolute resting HR (bpm). Fallback when no personal baseline yet.
const HR_ABS_ANCHORS = [
  [35, 100], [50, 100], [60, 85], [70, 65], [80, 40], [95, 20], [120, 20],
] as const;

function hrAbsoluteScore(hr: number): number {
  return Math.round(interpolate(hr, HR_ABS_ANCHORS));
}

// HRV ratio (today / 14d baseline). Higher = better.
const HRV_RATIO_ANCHORS = [
  [0.50, 20], [0.80, 40], [0.90, 65], [1.0, 85], [1.10, 100], [1.40, 100],
] as const;

function hrvRatioScore(ratio: number): number {
  return Math.round(interpolate(ratio, HRV_RATIO_ANCHORS));
}

// Absolute HRV (ms RMSSD). Fallback when no personal baseline yet.
const HRV_ABS_ANCHORS = [
  [5, 20], [25, 40], [40, 65], [60, 85], [80, 100], [150, 100],
] as const;

function hrvAbsoluteScore(hrv: number): number {
  return Math.round(interpolate(hrv, HRV_ABS_ANCHORS));
}

// ACWR (acute / chronic). Inverted-U curve — sweet spot ~0.8-1.0.
const ACWR_ANCHORS = [
  [0.0, 85], [0.5, 92], [0.85, 100], [1.0, 100], [1.15, 90], [1.30, 65], [1.40, 50], [1.50, 35], [1.70, 25], [3.0, 20],
] as const;

function acwrScore(acwr: number): number {
  return Math.round(interpolate(acwr, ACWR_ANCHORS));
}

// Activity load ratio (today / 14d median). Higher daily activity = more fatigue.
const ACTIVITY_ANCHORS = [
  [0.0, 100], [0.70, 100], [1.0, 88], [1.30, 75], [1.60, 58], [2.0, 40], [4.0, 40],
] as const;

function activityLoadScore(ratio: number): number {
  return Math.round(interpolate(ratio, ACTIVITY_ANCHORS));
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
  baseline: { restingHR: null, hrv: null, steps: null, activeCalories: null, daysOfData: 0, hrDays: 0, hrvDays: 0, stepsDays: 0, calDays: 0 },
  trainingLoad: {
    acwr: null, daysSinceLast: null, consecutiveDays: 0,
    acute7dTonnage: null, chronic28dAvgTonnage: null, lastTonnage: null, intensity: null,
  },
};

// ── Per-stream ACWR helper ──────────────────────────────────────────────────

/**
 * Computes ACWR-derived load metrics for a SINGLE training stream
 * (e.g. just strength, or just cardio). Used twice from scoreFromData
 * so each domain gets its own chronic baseline rather than being mixed
 * into one combined stream (which previously caused a fresh cardio
 * routine to crater the score of an established lifter).
 *
 * The sparse-data threshold (≥21d to fully trust ACWR) is applied
 * per-stream too — a stream with no history yet contributes nothing
 * to the final blended score.
 */
type StreamLoad = {
  /** Final score for this stream, null when the stream has no workouts */
  score: number | null;
  /** Days of training history within the 28d chronic window */
  spanDays: number;
  /** acute7 / chronicAvg ratio, null when no data or no chronic baseline */
  acwr: number | null;
  acuteTonnage: number;
  chronicAvgTonnage: number;
};

function computeStreamLoad(
  stream: WorkoutLike[],
  asOfMs: number,
  daysFallback: number,
): StreamLoad {
  const cutoff28 = asOfMs - 28 * DAY_MS;
  const cutoff7 = asOfMs - 7 * DAY_MS;
  const workouts = stream
    .filter((w) => w.completedAt.getTime() <= asOfMs && w.completedAt.getTime() >= cutoff28)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  if (workouts.length === 0) {
    return { score: null, spanDays: 0, acwr: null, acuteTonnage: 0, chronicAvgTonnage: 0 };
  }

  const earliestMs = workouts[workouts.length - 1]!.completedAt.getTime();
  const spanDays = Math.min(28, Math.max(7, Math.ceil((asOfMs - earliestMs) / DAY_MS) + 1));
  const spanWeeks = spanDays / 7;

  const TRUSTWORTHY_ACWR_DAYS = 21;
  const trustACWR = spanDays >= TRUSTWORTHY_ACWR_DAYS;

  const withTonnage = workouts.filter((w) => w.tonnage != null) as Array<{ completedAt: Date; tonnage: number }>;

  let acwr: number | null = null;
  let acute = 0;
  let chronicAvg = 0;
  let acwrBase: number;

  if (withTonnage.length > 0) {
    acute = withTonnage.filter((w) => w.completedAt.getTime() >= cutoff7).reduce((s, w) => s + w.tonnage, 0);
    const chronicSum = withTonnage.reduce((s, w) => s + w.tonnage, 0);
    chronicAvg = chronicSum / spanWeeks;
    if (chronicAvg > 0) {
      acwr = acute / chronicAvg;
      acwrBase = acwrScore(acwr);
    } else {
      acwrBase = daysFallback;
    }
  } else {
    // Count-based ACWR when no tonnage data is logged (e.g. bodyweight sessions)
    const acute7Count = workouts.filter((w) => w.completedAt.getTime() >= cutoff7).length;
    const chronicCount = workouts.length / spanWeeks;
    if (chronicCount > 0) {
      acwr = acute7Count / chronicCount;
      acwrBase = acwrScore(acwr);
    } else {
      acwrBase = daysFallback;
    }
  }

  const score = trustACWR ? acwrBase : Math.max(acwrBase, daysFallback);
  return { score, spanDays, acwr, acuteTonnage: acute, chronicAvgTonnage: chronicAvg };
}

// ── Pure scoring function ───────────────────────────────────────────────────
// Computes a recovery breakdown for a given moment in time, given the data
// available up to that point. Used by both the live endpoint and the history
// computation.

export function scoreFromData(
  asOfMs: number,
  allSnapshots: SnapshotLike[],
  allStrength: WorkoutLike[],
  allCardio: WorkoutLike[] = [],
): RecoveryBreakdown {
  // Combined stream is used for daysSinceLast / consecutiveDays — those care
  // about whether the user touched ANY training, not which kind.
  const allWorkouts: WorkoutLike[] = [...allStrength, ...allCardio];
  const asOfDayIdx = Math.floor(asOfMs / DAY_MS);

  // Snapshots ≤ asOf, sorted ascending
  const snapshots = allSnapshots
    .filter((s) => Math.floor(s.date.getTime() / DAY_MS) <= asOfDayIdx)
    .slice(-29); // 28 baseline + 1 current
  if (snapshots.length === 0) return EMPTY_BREAKDOWN;

  // "Today" = the most recent snapshot on or before asOf (some users skip days).
  // If that snapshot is older than 1 day it must not masquerade as today's
  // physiology — sleep/HR/HRV/activity then count as "no data" and the score
  // falls back to training load alone (which is date-based and always current).
  const latest = snapshots[snapshots.length - 1]!;
  const latestAgeDays = asOfDayIdx - Math.floor(latest.date.getTime() / DAY_MS);
  const stale = latestAgeDays > 1;
  const today: SnapshotLike = stale
    ? {
        date: latest.date,
        sleepDuration: null, sleepQuality: null,
        restingHeartRate: null, hrv: null,
        steps: null, activeCalories: null,
      }
    : latest;
  const baselineWindow = stale ? snapshots : snapshots.slice(0, -1);
  const baseline14 = baselineWindow.slice(-14);

  const hrValues = baseline14.map((s) => s.restingHeartRate).filter((v): v is number => v != null);
  const hrvValues = baseline14.map((s) => s.hrv).filter((v): v is number => v != null);
  const stepsValues = baseline14.map((s) => s.steps).filter((v): v is number => v != null);
  const calValues = baseline14.map((s) => s.activeCalories).filter((v): v is number => v != null);

  const hrBaseline = hrValues.length >= 7 ? median(hrValues) : null;
  const hrvBaseline = hrvValues.length >= 7 ? median(hrvValues) : null;
  const stepsBaseline = stepsValues.length >= 5 ? median(stepsValues) : null;
  const calBaseline = calValues.length >= 5 ? median(calValues) : null;

  // 3-day trends. Use CALENDAR days, not "last 3 snapshots" — otherwise a
  // user with sparse data (gaps) gets a trend computed across 5+ days, which
  // distorts the slope. We need the snapshots that fall in the last 3 days
  // BEFORE today (today itself is the value being compared against the trend).
  const trendCutoffDayIdx = asOfDayIdx - 3;
  const trend3 = baselineWindow.filter(
    (s) => Math.floor(s.date.getTime() / DAY_MS) > trendCutoffDayIdx,
  );
  const trend3hr = trend3.map((s) => s.restingHeartRate).filter((v): v is number => v != null);
  const trend3hrv = trend3.map((s) => s.hrv).filter((v): v is number => v != null);
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

  // HR (ratio + trend adjustment). Adjustment is proportional to the slope:
  // rising HR over days is bad (penalty), falling is good (small bonus).
  // Clamped so a single noisy day can't swing the score wildly.
  let hrSc: number | null = null;
  if (today.restingHeartRate != null) {
    const base = hrBaseline != null
      ? hrRatioScore(today.restingHeartRate / hrBaseline)
      : hrAbsoluteScore(today.restingHeartRate);
    const trendAdj = clamp(-hrSlope * 10, -15, 5);
    hrSc = Math.round(clamp(base + trendAdj, 5, 100));
  }

  // HRV (ratio + trend adjustment). Mirror logic: falling HRV is bad,
  // rising HRV is good. Asymmetric scaling matches the physiological
  // reality that a sudden HRV drop is a stronger signal than a slow rise.
  let hrvSc: number | null = null;
  if (today.hrv != null) {
    const base = hrvBaseline != null
      ? hrvRatioScore(today.hrv / hrvBaseline)
      : hrvAbsoluteScore(today.hrv);
    const trendAdj = clamp(hrvSlope * 5, -15, 8);
    hrvSc = Math.round(clamp(base + trendAdj, 5, 100));
  }

  // ── Per-domain ACWR streams ────────────────────────────────────────────────
  // Strength and cardio are scored independently so introducing a new training
  // type (e.g. starting cardio with no prior history) doesn't crater the load
  // score for someone whose strength routine is steady. Each stream gets its
  // own chronic baseline, ACWR ratio, score, and sparse-data fallback. The
  // final loadScore blends them weighted by how much history each has.
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

    const daysFallback =
      daysSinceLast === 0 ? 45 :
      daysSinceLast === 1 ? 75 :
      daysSinceLast === 2 ? 90 : 100;
    const consMul = Math.max(0.60, 1 - Math.max(0, consecutiveDays - 1) * 0.15);

    const strengthStream = computeStreamLoad(allStrength, asOfMs, daysFallback);
    const cardioStream = computeStreamLoad(allCardio, asOfMs, daysFallback);

    // Blend per-stream scores weighted by data span (capped at 21 = full weight).
    // A stream with no recent data contributes nothing. If only one stream has
    // data, the other is excluded entirely so it doesn't drag the average down.
    const streams = [strengthStream, cardioStream].filter((s) => s.score != null);
    if (streams.length === 0) {
      loadSc = Math.round(daysFallback * consMul);
    } else {
      const totalWeight = streams.reduce((s, x) => s + Math.min(1, x.spanDays / 21), 0);
      const weighted = streams.reduce((s, x) => s + x.score! * Math.min(1, x.spanDays / 21), 0);
      let base = totalWeight > 0 ? Math.round(weighted / totalWeight) : daysFallback;
      if (consecutiveDays >= 2) base = Math.round(base * consMul);
      loadSc = base;
    }

    // Display values — sum the two streams into a combined view so the existing
    // UI fields stay meaningful. The PER-DOMAIN ratios are exposed separately
    // via trainingLoad.strengthAcwr / cardioAcwr for cards that want the split.
    acute7dTonnage = strengthStream.acuteTonnage + cardioStream.acuteTonnage;
    chronic28dAvgTonnage = strengthStream.chronicAvgTonnage + cardioStream.chronicAvgTonnage;
    acwr = chronic28dAvgTonnage > 0 ? acute7dTonnage / chronic28dAvgTonnage : null;

    // Intensity from the most recent session's tonnage vs daily chronic avg.
    const dailyChronicAvg = chronic28dAvgTonnage / 7;
    if (lastTonnage != null && dailyChronicAvg > 0) {
      const r = lastTonnage / dailyChronicAvg;
      intensity = r >= 1.3 ? "high" : r <= 0.7 ? "low" : "medium";
    } else {
      intensity = "medium";
    }
  } else {
    loadSc = 100;
  }

  // Activity score represents NON-training daily movement (commuting, walking,
  // errands). Workout fatigue is already counted by the load score — including
  // active calories here would double-penalize workout days, since a workout
  // simultaneously raises active calories AND triggers the load score's ACWR
  // penalty. Steps are the cleaner signal for general daily activity, with
  // active calories only as a fallback when steps aren't available.
  let actSc: number | null = null;
  const stepsRatio = today.steps != null && stepsBaseline != null && stepsBaseline > 0
    ? today.steps / stepsBaseline : null;
  const calRatio = today.activeCalories != null && calBaseline != null && calBaseline > 0
    ? today.activeCalories / calBaseline : null;
  const activityRatio = stepsRatio ?? calRatio;
  if (activityRatio != null) {
    actSc = activityLoadScore(activityRatio);
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
      // Total days the user has data for each metric (incl. today if today has it).
      // The baseline kicks in once total ≥ 8 (= 7 baseline days + today).
      daysOfData: Math.max(hrValues.length, hrvValues.length)
        + (today.restingHeartRate != null || today.hrv != null ? 1 : 0),
      hrDays: hrValues.length + (today.restingHeartRate != null ? 1 : 0),
      hrvDays: hrvValues.length + (today.hrv != null ? 1 : 0),
      stepsDays: stepsValues.length + (today.steps != null ? 1 : 0),
      calDays: calValues.length + (today.activeCalories != null ? 1 : 0),
    },
    trainingLoad: {
      acwr, daysSinceLast, consecutiveDays,
      acute7dTonnage, chronic28dAvgTonnage, lastTonnage, intensity,
    },
  };
}

// ── Data fetching ───────────────────────────────────────────────────────────

/**
 * Cardio active-kcal → strength-tonnage-equivalent conversion.
 *
 * Earlier value of 15 was based on raw work output (1 strength kcal ≈ 17 kg
 * tonnage) but that overstates *systemic* fatigue from cardio. A 60-min
 * moderate cycle (~450 kcal) would have been counted as 6.750 kg tonnage —
 * the equivalent of a heavy compound strength session, which it definitely
 * is not in terms of CNS load and recovery cost.
 *
 * 8 maps the same 60-min cycle to ~3.600 kg equivalent (≈ a light/moderate
 * strength session) which matches subjective fatigue much better.
 */
const CARDIO_KCAL_TO_TONNAGE = 8;

async function fetchSnapshotsAndWorkouts(userId: string, sinceMs: number) {
  const since = new Date(sinceMs);
  since.setUTCHours(0, 0, 0, 0);

  const [snapshots, workouts, appleWorkouts] = await Promise.all([
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
    // Cardio from Apple Health — exclude strength-training so we don't
    // double-count with the user-logged Workout records above. HAE may emit
    // either the English Apple Health name or the localized German
    // "Krafttraining" depending on device locale. Match both.
    prisma.appleWorkout.findMany({
      where: {
        userId,
        startedAt: { gte: since },
        NOT: {
          OR: [
            { type: { contains: "Strength", mode: "insensitive" } },
            { type: { contains: "Krafttraining", mode: "insensitive" } },
          ],
        },
      },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, activeCalories: true, durationSec: true },
    }),
  ]);

  const strengthLoads: WorkoutLike[] = workouts
    .filter((w): w is typeof w & { completedAt: Date } => w.completedAt != null)
    .map((w) => {
      const t = w.workoutExercises
        .flatMap((we) => we.sets)
        .reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0);
      return { completedAt: w.completedAt, tonnage: t > 0 ? t : null };
    });

  // Convert each cardio session to a strength-tonnage equivalent so ACWR works
  // uniformly. Fall back to a duration-based estimate when active kcal aren't
  // logged (e.g. yoga sessions from older watchOS versions).
  const cardioLoads: WorkoutLike[] = appleWorkouts.map((w) => {
    const fromKcal = w.activeCalories != null ? w.activeCalories * CARDIO_KCAL_TO_TONNAGE : null;
    // 1 min ≈ 5 kcal of moderate effort × 15 kg/kcal = 75 kg/min
    const fromDuration = fromKcal == null ? (w.durationSec / 60) * 75 : null;
    const tonnage = fromKcal ?? fromDuration;
    return { completedAt: w.startedAt, tonnage: tonnage != null && tonnage > 0 ? tonnage : null };
  });

  return {
    snapshots: snapshots as SnapshotLike[],
    strengthLoads,
    cardioLoads,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function computeRecovery(userId: string): Promise<RecoveryBreakdown> {
  const now = Date.now();
  const { snapshots, strengthLoads, cardioLoads } = await fetchSnapshotsAndWorkouts(userId, now - 28 * DAY_MS);
  return scoreFromData(now, snapshots, strengthLoads, cardioLoads);
}

// Returns one score per day for the last `days` days (ending today).
// Days where the user has no snapshot are skipped (so the chart shows gaps).
export async function computeRecoveryHistory(
  userId: string,
  days: number = 30,
): Promise<RecoveryHistoryPoint[]> {
  const now = Date.now();
  // Need 28 days of context BEFORE the earliest history day
  const { snapshots, strengthLoads, cardioLoads } = await fetchSnapshotsAndWorkouts(userId, now - (28 + days) * DAY_MS);
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
    const breakdown = scoreFromData(asOfMs, snapshots, strengthLoads, cardioLoads);
    if (breakdown.level === "none") continue;
    const date = new Date(dayIdx * DAY_MS).toISOString().slice(0, 10);
    points.push({ date, score: breakdown.score, level: breakdown.level });
  }

  return points;
}

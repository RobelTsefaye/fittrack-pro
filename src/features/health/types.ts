export type HealthSnapshot = {
  id: string;
  date: string; // ISO date string
  sleepDuration: number | null;
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  sleepDeepMinutes: number | null;
  sleepRemMinutes: number | null;
  sleepQuality: number | null;
  restingHeartRate: number | null;
  heartRateAvg: number | null;
  hrv: number | null;
  steps: number | null;
  activeCalories: number | null;
  exerciseMinutes: number | null;
  standHours: number | null;
  vo2Max: number | null;
  calories: number | null;
  dietaryCalories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  caffeine: number | null;
  water: number | null;
  vitaminD: number | null;
  vitaminC: number | null;
  calcium: number | null;
  iron: number | null;
  potassium: number | null;
  magnesium: number | null;
  mindfulMinutes: number | null;
  updatedAt: string;
};

export type RecoveryLevel = "high" | "mid" | "low" | "none";

export type RecoveryScore = {
  score: number; // 0–100
  level: RecoveryLevel;
  sleepScore: number;
  hrScore: number;
  hrvScore: number;
};

export function calcRecoveryScore(snap: HealthSnapshot): RecoveryScore {
  const factors: { value: number; weight: number }[] = [];

  // Sleep score (weight 40 %)
  if (snap.sleepDuration != null) {
    const h = snap.sleepDuration;
    const s =
      h >= 8 ? 100
      : h >= 7 ? 85
      : h >= 6 ? 65
      : h >= 5 ? 40
      : 15;
    factors.push({ value: s, weight: 0.4 });
  }

  // Resting HR score (weight 30 %) — lower = better
  const hrScore = (() => {
    if (snap.restingHeartRate == null) return null;
    const hr = snap.restingHeartRate;
    if (hr <= 50) return 100;
    if (hr <= 60) return 85;
    if (hr <= 70) return 65;
    if (hr <= 80) return 40;
    return 20;
  })();
  if (hrScore != null) factors.push({ value: hrScore, weight: 0.3 });

  // HRV score (weight 30 %) — higher = better, typical range 20–100ms
  const hrvScore = (() => {
    if (snap.hrv == null) return null;
    const v = snap.hrv;
    if (v >= 80) return 100;
    if (v >= 60) return 85;
    if (v >= 40) return 65;
    if (v >= 25) return 40;
    return 20;
  })();
  if (hrvScore != null) factors.push({ value: hrvScore, weight: 0.3 });

  if (factors.length === 0) {
    return { score: 0, level: "none", sleepScore: 0, hrScore: 0, hrvScore: 0 };
  }

  // Normalize weights to sum to 1
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(
    factors.reduce((s, f) => s + (f.value * f.weight) / totalWeight, 0)
  );

  const level: RecoveryLevel =
    score >= 75 ? "high" : score >= 50 ? "mid" : "low";

  return {
    score,
    level,
    sleepScore: snap.sleepDuration != null ? factors[0]?.value ?? 0 : 0,
    hrScore: hrScore ?? 0,
    hrvScore: hrvScore ?? 0,
  };
}

export function formatSleepDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

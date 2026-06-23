import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────────────────────

export type CardioCategory = "outdoor" | "indoor";

export type CardioSession = {
  id: string;
  type: string;
  category: CardioCategory;
  startedAt: string; // ISO
  durationMin: number;
  distanceKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  activeCalories: number | null;
  elevationGainM: number | null;
};

export type CardioPeriodStats = {
  sessions: number;
  distanceKm: number;
  durationMin: number;
  activeCalories: number;
};

export type CardioWeekPoint = CardioPeriodStats & {
  weekStart: string; // ISO date — Monday of the week
  label: string;     // "KW 21" — short tag for the chart
};

export type CardioTypeBreakdown = {
  type: string;
  count: number;
  distanceKm: number;
  durationMin: number;
};

export type CardioCategoryGroup = {
  thisWeek: CardioPeriodStats;
  lastWeek: CardioPeriodStats;
  weeklyHistory: CardioWeekPoint[];
  typeBreakdown: CardioTypeBreakdown[]; // current week
  recentSessions: CardioSession[];      // last 30 days
};

export type CardioSummary = {
  // Combined totals (used by the dashboard card)
  thisWeek: CardioPeriodStats;
  lastWeek: CardioPeriodStats;
  typeBreakdown: CardioTypeBreakdown[];
  // Split for the detail page
  outdoor: CardioCategoryGroup;
  indoor:  CardioCategoryGroup;
};

// ── Indoor / outdoor classification ──────────────────────────────────────────

// Types Apple Health uses for explicitly indoor sessions, or types where
// distance is meaningless even outside (yoga, HIIT, core training, ...).
const INDOOR_TYPE_KEYWORDS = [
  "Indoor", "Pool", "Elliptical", "Stair", "HIIT",
  "Yoga", "Rowing", "Core", "Functional", "Pilates", "Mind",
  "Step", "Cooldown", "Flexibility",
] as const;

function isIndoorType(type: string): boolean {
  const t = type.toLowerCase();
  return INDOOR_TYPE_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}

/**
 * Categorize a workout as outdoor (distance/pace-focused) or indoor
 * (time/intensity-focused). Type name takes precedence over distance —
 * an outdoor run with zero GPS distance is still outdoor. Indoor types
 * with non-zero distance (e.g. rowing meters) stay indoor because the
 * user's mental model maps them that way.
 */
function categorize(type: string, distanceMeters: number | null): CardioCategory {
  if (isIndoorType(type)) return "indoor";
  // If no explicit indoor marker AND no distance was recorded → fall to indoor
  // (mostly catches "Other"/"Mixed Cardio" sessions done on a treadmill etc.)
  if (distanceMeters == null || distanceMeters === 0) return "indoor";
  return "outdoor";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfIsoWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
}

function emptyStats(): CardioPeriodStats {
  return { sessions: 0, distanceKm: 0, durationMin: 0, activeCalories: 0 };
}

function buildWeeklyHistory(thisWeekStart: Date): CardioWeekPoint[] {
  const out: CardioWeekPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(thisWeekStart.getTime() - i * 7 * DAY_MS);
    out.push({
      weekStart: ws.toISOString().slice(0, 10),
      label: `KW ${isoWeekNumber(ws)}`,
      ...emptyStats(),
    });
  }
  return out;
}

function emptyGroup(thisWeekStart: Date): CardioCategoryGroup {
  return {
    thisWeek: emptyStats(),
    lastWeek: emptyStats(),
    weeklyHistory: buildWeeklyHistory(thisWeekStart),
    typeBreakdown: [],
    recentSessions: [],
  };
}

function addStats(target: CardioPeriodStats, distKm: number, durMin: number, kcal: number) {
  target.sessions += 1;
  target.distanceKm += distKm;
  target.durationMin += durMin;
  target.activeCalories += kcal;
}

// ── Main aggregator ──────────────────────────────────────────────────────────

export async function getCardioSummary(userId: string): Promise<CardioSummary> {
  const now = new Date();
  const thisWeekStart = startOfIsoWeek(now);
  const since = new Date(thisWeekStart.getTime() - 7 * 7 * DAY_MS); // 7 weeks before this week

  // Strength training is captured separately — keep this list in sync with
  // the same filter used in recovery.ts.
  const rows = await prisma.appleWorkout.findMany({
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
  });

  // Combined buckets (for dashboard card)
  const combinedThisWeek = emptyStats();
  const combinedLastWeek = emptyStats();
  const combinedTypeMap = new Map<string, CardioTypeBreakdown>();

  // Per-category buckets
  const outdoor = emptyGroup(thisWeekStart);
  const indoor = emptyGroup(thisWeekStart);

  const outdoorTypeMap = new Map<string, CardioTypeBreakdown>();
  const indoorTypeMap = new Map<string, CardioTypeBreakdown>();

  const thisWeekStartMs = thisWeekStart.getTime();
  const lastWeekStartMs = thisWeekStartMs - 7 * DAY_MS;
  const recentCutoff = now.getTime() - 30 * DAY_MS;

  for (const w of rows) {
    const startMs = w.startedAt.getTime();
    const durationMin = w.durationSec / 60;
    const distanceMeters = w.distanceMeters ?? null;
    const distanceKm = distanceMeters != null ? distanceMeters / 1000 : 0;
    const kcal = w.activeCalories ?? 0;

    const category = categorize(w.type, distanceMeters);
    const group = category === "outdoor" ? outdoor : indoor;
    const typeMap = category === "outdoor" ? outdoorTypeMap : indoorTypeMap;

    // Weekly bucket (combined isn't shown as a chart anymore, but per-group is)
    const weekPoint = group.weeklyHistory.find((p) => {
      const wStart = new Date(p.weekStart + "T00:00:00Z").getTime();
      return startMs >= wStart && startMs < wStart + 7 * DAY_MS;
    });
    if (weekPoint) addStats(weekPoint, distanceKm, durationMin, kcal);

    // This week / last week aggregates (both combined and per-group)
    if (startMs >= thisWeekStartMs) {
      addStats(combinedThisWeek, distanceKm, durationMin, kcal);
      addStats(group.thisWeek, distanceKm, durationMin, kcal);

      // Type breakdown for current week only
      for (const map of [combinedTypeMap, typeMap]) {
        const existing = map.get(w.type) ?? { type: w.type, count: 0, distanceKm: 0, durationMin: 0 };
        existing.count += 1;
        existing.distanceKm += distanceKm;
        existing.durationMin += durationMin;
        map.set(w.type, existing);
      }
    } else if (startMs >= lastWeekStartMs) {
      addStats(combinedLastWeek, distanceKm, durationMin, kcal);
      addStats(group.lastWeek, distanceKm, durationMin, kcal);
    }

    if (startMs >= recentCutoff) {
      group.recentSessions.push({
        id: w.id,
        type: w.type,
        category,
        startedAt: w.startedAt.toISOString(),
        durationMin,
        distanceKm: distanceMeters != null && distanceMeters > 0 ? distanceKm : null,
        avgHeartRate: w.avgHeartRate,
        maxHeartRate: w.maxHeartRate,
        activeCalories: w.activeCalories,
        elevationGainM: w.elevationGainM,
      });
    }
  }

  const byCount = (a: CardioTypeBreakdown, b: CardioTypeBreakdown) => b.count - a.count;
  outdoor.typeBreakdown = Array.from(outdoorTypeMap.values()).sort(byCount);
  indoor.typeBreakdown = Array.from(indoorTypeMap.values()).sort(byCount);

  return {
    thisWeek: combinedThisWeek,
    lastWeek: combinedLastWeek,
    typeBreakdown: Array.from(combinedTypeMap.values()).sort(byCount),
    outdoor,
    indoor,
  };
}

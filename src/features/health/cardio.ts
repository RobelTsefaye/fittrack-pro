import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────────────────────

export type CardioSession = {
  id: string;
  type: string;
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

export type CardioSummary = {
  thisWeek: CardioPeriodStats;
  lastWeek: CardioPeriodStats;
  weeklyHistory: CardioWeekPoint[]; // last 8 weeks, ascending
  typeBreakdown: CardioTypeBreakdown[]; // current week
  recentSessions: CardioSession[]; // last 30 days, newest first
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO week start (Monday 00:00 UTC) for a given date. */
function startOfIsoWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

/** ISO 8601 week number (Monday-based). */
function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
}

/**
 * Initial empty stats — also serves as the identity for fold operations.
 */
function emptyStats(): CardioPeriodStats {
  return { sessions: 0, distanceKm: 0, durationMin: 0, activeCalories: 0 };
}

// ── Main aggregator ──────────────────────────────────────────────────────────

export async function getCardioSummary(userId: string): Promise<CardioSummary> {
  // 8 weeks back so the weeklyHistory chart has 8 points.
  const now = new Date();
  const thisWeekStart = startOfIsoWeek(now);
  const since = new Date(thisWeekStart.getTime() - 7 * 7 * DAY_MS); // 7 weeks before this week

  const rows = await prisma.appleWorkout.findMany({
    where: { userId, startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
  });

  // Initialize 8 weekly buckets, oldest first
  const weeklyHistory: CardioWeekPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(thisWeekStart.getTime() - i * 7 * DAY_MS);
    weeklyHistory.push({
      weekStart: ws.toISOString().slice(0, 10),
      label: `KW ${isoWeekNumber(ws)}`,
      ...emptyStats(),
    });
  }

  const thisWeekStartMs = thisWeekStart.getTime();
  const lastWeekStartMs = thisWeekStartMs - 7 * DAY_MS;

  let thisWeek = emptyStats();
  let lastWeek = emptyStats();
  const typeMap = new Map<string, CardioTypeBreakdown>();
  const recentCutoff = now.getTime() - 30 * DAY_MS;
  const recentSessions: CardioSession[] = [];

  for (const w of rows) {
    const startMs = w.startedAt.getTime();
    const durationMin = w.durationSec / 60;
    const distanceKm = w.distanceMeters != null ? w.distanceMeters / 1000 : 0;
    const kcal = w.activeCalories ?? 0;

    // Weekly bucket — match by the weekStart we initialized above
    const point = weeklyHistory.find((p) => {
      const wStart = new Date(p.weekStart + "T00:00:00Z").getTime();
      return startMs >= wStart && startMs < wStart + 7 * DAY_MS;
    });
    if (point) {
      point.sessions += 1;
      point.distanceKm += distanceKm;
      point.durationMin += durationMin;
      point.activeCalories += kcal;
    }

    // This week / last week aggregates
    if (startMs >= thisWeekStartMs) {
      thisWeek.sessions += 1;
      thisWeek.distanceKm += distanceKm;
      thisWeek.durationMin += durationMin;
      thisWeek.activeCalories += kcal;

      // Type breakdown for current week only
      const existing = typeMap.get(w.type) ?? { type: w.type, count: 0, distanceKm: 0, durationMin: 0 };
      existing.count += 1;
      existing.distanceKm += distanceKm;
      existing.durationMin += durationMin;
      typeMap.set(w.type, existing);
    } else if (startMs >= lastWeekStartMs && startMs < thisWeekStartMs) {
      lastWeek.sessions += 1;
      lastWeek.distanceKm += distanceKm;
      lastWeek.durationMin += durationMin;
      lastWeek.activeCalories += kcal;
    }

    if (startMs >= recentCutoff) {
      recentSessions.push({
        id: w.id,
        type: w.type,
        startedAt: w.startedAt.toISOString(),
        durationMin,
        distanceKm: w.distanceMeters != null ? distanceKm : null,
        avgHeartRate: w.avgHeartRate,
        maxHeartRate: w.maxHeartRate,
        activeCalories: w.activeCalories,
        elevationGainM: w.elevationGainM,
      });
    }
  }

  const typeBreakdown = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);

  return { thisWeek, lastWeek, weeklyHistory, typeBreakdown, recentSessions };
}

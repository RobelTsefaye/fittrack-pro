import { prisma } from "@/lib/prisma";
import { getNextPlanSession } from "@/features/dashboard/queries";
import { parseDateOnlyUtc, formatDateOnlyUtc } from "@/lib/date-only";

export type ScheduledTraining = {
  date: string; // "YYYY-MM-DD" — lokaler Kalendertag des Nutzers
  weekday: number; // 0=Mo .. 6=So
  sessionId: string;
  sessionName: string;
  planName: string;
};

export const DEFAULT_HORIZON_DAYS = 28;

const DAY_MS = 86_400_000;

/**
 * Setzt die bestehende Plan-Rotation über die gewählten Wochentage fort.
 * `todayLocal` kommt vom Client (lokaler Kalendertag) — der Server macht
 * keinerlei Zeitzonen-Mathematik, Datums-Stepping läuft rein über
 * UTC-Kalendertage als Rechenhilfe. Der erste geplante Tag ist IMMER
 * morgen (heute wird nie eingetragen), und er bekommt das aktuelle
 * "nächste Training"; danach wird pro Trainingstag eine Session
 * weitergedreht (Modulo-Wrap).
 */
export async function computeTrainingSchedule(
  userId: string,
  todayLocal: string,
  horizonDays: number = DEFAULT_HORIZON_DAYS
): Promise<ScheduledTraining[]> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { trainingWeekdays: true },
  });
  const weekdays = new Set(settings?.trainingWeekdays ?? []);
  if (weekdays.size === 0) return [];

  const next = await getNextPlanSession(userId);
  if (!next) return [];

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: next.planId },
    select: {
      name: true,
      sessions: { orderBy: { order: "asc" }, select: { id: true, name: true } },
    },
  });
  if (!plan || plan.sessions.length === 0) return [];

  let idx = plan.sessions.findIndex((s) => s.id === next.sessionId);
  if (idx === -1) idx = 0;

  const start = parseDateOnlyUtc(todayLocal);
  const result: ScheduledTraining[] = [];
  for (let offset = 1; offset <= horizonDays; offset++) {
    const d = new Date(start.getTime() + offset * DAY_MS);
    const weekday = (d.getUTCDay() + 6) % 7;
    if (!weekdays.has(weekday)) continue;
    const session = plan.sessions[idx % plan.sessions.length]!;
    result.push({
      date: formatDateOnlyUtc(d),
      weekday,
      sessionId: session.id,
      sessionName: session.name,
      planName: plan.name,
    });
    idx++;
  }
  return result;
}

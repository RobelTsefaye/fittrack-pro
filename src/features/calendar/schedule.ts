import { prisma } from "@/lib/prisma";
import { getNextPlanSession } from "@/features/dashboard/queries";
import { parseDateOnlyUtc, formatDateOnlyUtc } from "@/lib/date-only";
import type { CalendarKind } from "@/generated/prisma/client";

export type CalendarEntry = {
  date: string;
  sourceDate: string;
  title: string;
  notes: string | null;
  startMinutes: number;
  durationMinutes: number;
};

export type CalendarOverrideValue = {
  date: Date;
  skip: boolean;
  movedToDate: Date | null;
  timeMinutes: number | null;
  durationMinutes: number | null;
};

export const DEFAULT_HORIZON_DAYS = 28;
const DAY_MS = 86_400_000;

export function applyOverrides(entries: CalendarEntry[], overrides: CalendarOverrideValue[]): CalendarEntry[] {
  const byDate = new Map(overrides.map((override) => [formatDateOnlyUtc(override.date), override]));
  return entries.flatMap((entry) => {
    const override = byDate.get(entry.sourceDate);
    if (!override) return [entry];
    if (override.skip) return [];
    return [{
      ...entry,
      date: override.movedToDate ? formatDateOnlyUtc(override.movedToDate) : entry.date,
      startMinutes: override.timeMinutes ?? entry.startMinutes,
      durationMinutes: override.durationMinutes ?? entry.durationMinutes,
    }];
  });
}

export async function getCalendarOverrides(userId: string, kind: CalendarKind, entries: CalendarEntry[]) {
  if (entries.length === 0) return [];
  return prisma.calendarOverride.findMany({
    where: { userId, kind, date: { in: entries.map((entry) => parseDateOnlyUtc(entry.sourceDate)) } },
    select: { date: true, skip: true, movedToDate: true, timeMinutes: true, durationMinutes: true },
  });
}

export async function computeTrainingSchedule(userId: string, todayLocal: string, horizonDays = DEFAULT_HORIZON_DAYS): Promise<CalendarEntry[]> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId }, select: { trainingWeekdays: true, trainingTimeMinutes: true, trainingDurationMinutes: true },
  });
  const weekdays = new Set(settings?.trainingWeekdays ?? []);
  if (weekdays.size === 0) return [];
  const next = await getNextPlanSession(userId);
  if (!next) return [];
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: next.planId }, select: { name: true, sessions: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
  });
  if (!plan || plan.sessions.length === 0) return [];
  let idx = plan.sessions.findIndex((session) => session.id === next.sessionId);
  if (idx === -1) idx = 0;
  const start = parseDateOnlyUtc(todayLocal);
  const result: CalendarEntry[] = [];
  for (let offset = 1; offset <= horizonDays; offset++) {
    const day = new Date(start.getTime() + offset * DAY_MS);
    if (!weekdays.has((day.getUTCDay() + 6) % 7)) continue;
    const session = plan.sessions[idx % plan.sessions.length]!;
    const date = formatDateOnlyUtc(day);
    result.push({ date, sourceDate: date, title: session.name, notes: plan.name, startMinutes: settings?.trainingTimeMinutes ?? 1080, durationMinutes: settings?.trainingDurationMinutes ?? 90 });
    idx++;
  }
  return result;
}

export async function computeCardioSchedule(userId: string, todayLocal: string, horizonDays = DEFAULT_HORIZON_DAYS): Promise<CalendarEntry[]> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId }, select: { cardioWeekdays: true, cardioTimeMinutes: true, cardioDurationMinutes: true, cardioLabel: true },
  });
  const weekdays = new Set(settings?.cardioWeekdays ?? []);
  if (weekdays.size === 0) return [];
  const start = parseDateOnlyUtc(todayLocal);
  const result: CalendarEntry[] = [];
  for (let offset = 1; offset <= horizonDays; offset++) {
    const day = new Date(start.getTime() + offset * DAY_MS);
    if (!weekdays.has((day.getUTCDay() + 6) % 7)) continue;
    const date = formatDateOnlyUtc(day);
    result.push({ date, sourceDate: date, title: settings?.cardioLabel || "Cardio", notes: null, startMinutes: settings?.cardioTimeMinutes ?? 1080, durationMinutes: settings?.cardioDurationMinutes ?? 45 });
  }
  return result;
}

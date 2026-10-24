import { NextRequest, NextResponse } from "next/server";
import {
  computeCardioSchedule,
  computeTrainingSchedule,
  DEFAULT_HORIZON_DAYS,
  getCalendarOverrides,
} from "@/features/calendar/schedule";
import type { CalendarKind } from "@/generated/prisma/client";
import { requireUserId, withApi } from "@/lib/api/route-handler";
import { isValidDateOnly } from "@/lib/date-only";
export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind: CalendarKind | null =
    kindParam === "training" ? "TRAINING" : kindParam === "cardio" ? "CARDIO" : null;
  const today = req.nextUrl.searchParams.get("today") ?? "";
  if (!kind || !isValidDateOnly(today))
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  const raw = Number(req.nextUrl.searchParams.get("horizonDays") ?? DEFAULT_HORIZON_DAYS);
  const horizonDays = Number.isFinite(raw)
    ? Math.min(56, Math.max(1, Math.trunc(raw)))
    : DEFAULT_HORIZON_DAYS;
  const entries =
    kind === "TRAINING"
      ? await computeTrainingSchedule(userId, today, horizonDays)
      : await computeCardioSchedule(userId, today, horizonDays);
  const overrides = await getCalendarOverrides(userId, kind, entries);
  const byDate = new Map(
    overrides.map((override) => [override.date.toISOString().slice(0, 10), override])
  );
  return NextResponse.json({
    data: {
      entries: entries.map((entry) => {
        const override = byDate.get(entry.sourceDate);
        return {
          sourceDate: entry.sourceDate,
          defaultTitle: entry.title,
          defaultStartMinutes: entry.startMinutes,
          defaultDurationMinutes: entry.durationMinutes,
          override: override
            ? {
                skip: override.skip,
                movedToDate: override.movedToDate?.toISOString().slice(0, 10) ?? null,
                timeMinutes: override.timeMinutes,
                durationMinutes: override.durationMinutes,
              }
            : null,
        };
      }),
    },
  });
});
